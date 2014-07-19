/* Copyright 2014 Sam To... actually, no. I probably shouldn't put my full name
 * there in case of retribution ;-)
 *
 * Anyway, full license (Apache V2) in LICENSE file of repository */

Messages = new Meteor.Collection("messages");
ActiveUsers = new Meteor.Collection("actives");
/* The CurrentPomodoro collection contains a single document with the following
 * structure:
 *      {
 *          ends: <timestamp>, // indicates time at which current pomodoro or break ends
 *          duration: <integer, minutes>, // indicates length of pomodoro or break
 *          type: <string, 'pomo' or 'break'>
 *      } */
CurrentPomodoro = new Meteor.Collection("pomodoro");

function forceGetUser(cb) {
    /* XXX: Try storing this in session, just in case user stuff gets evicted
     * after a while. */
    var u = Meteor.user();
    if (u !== null) {
        return cb();
    }

    /* And, if all else fails... */
    var username = 'tempuser' + Random.secret();
    var password = Random.secret();
    Accounts.createUser({
        username: username,
        password: password
    }, cb);
}

function alive() {
    var uid = Meteor.userId();
    if (uid) {
        var time = new Date().getTime();
        var u = Meteor.user();
        var nick = undefined;
        if (u && u.profile && u.profile.nick) {
            nick = u.profile.nick;
        }
        if (!ActiveUsers.findOne({uid: uid})) {
            // Make sure we tell the room that they've joined!
            Messages.insert({
                time: time,
                message: (nick ? nick : Meteor.userId()) + ' joined the room',
            });
        }
        ActiveUsers.upsert({uid: uid},
            {$set:
                {lastSeen: time,
                 nick: nick}});
        return time;
    } else {
        // what if there's no UID?
        // technically we need to create a new account
        // XXX to fix
    }
    return null;
};

function kill(uid) {
    if (!uid) uid = Meteor.userId();
    var name = uid;
    var u = Meteor.users.findOne({_id: uid}, {fields: {profile: 1}});
    if (u && u.profile && u.profile.nick) {
        name = u.profile.nick;
    }
    if (ActiveUsers.remove({uid: uid})) {
        Messages.insert({time: new Date().getTime(),
                         message: name + ' left room'});
    }
}

function startPomoBreak(time, type) {
    // if there's no pomo running at the moment, start one.
    var pomo = CurrentPomodoro.findOne({});
    var now = new Date().getTime();
    var method = undefined;
    var doc = {
            ends: now + 60 * 1000 * time,
            duration: time,
            type: type
    };
    if (!pomo) {
        // create a new one!
        return CurrentPomodoro.insert(doc);
    } else if (pomo.ends < now) {
        // if the current pomo has actually expired
        return CurrentPomodoro.update({_id: pomo._id}, doc);
    }
    return null;
}

function startPomo(time) {
    return startPomoBreak(time, 'pomo');
}

function startBreak(time) {
    return startPomoBreak(time, 'break');
}

function encodeFrameDelta(original, now) {
    // Calculate a frame delta and store it in `original`
    for (var pixelOffset = 0; pixelOffset < now.data.length; pixelOffset += 4) {
        original.data[pixelOffset] = (now.data[pixelOffset] - original.data[pixelOffset] + 255) / 2;
        original.data[pixelOffset + 1] = (now.data[pixelOffset + 1] - original.data[pixelOffset + 1] + 255) / 2;
        original.data[pixelOffset + 2] = (now.data[pixelOffset + 2] - original.data[pixelOffset + 2] + 255) / 2;
        original.data[pixelOffset + 3] = 255;
    }
}

function applyFrameDelta(source, delta) {
    // Apply a frame-delta to an original in-place
    for (var pixelOffset = 0; pixelOffset < source.data.length; pixelOffset += 4) {
        source.data[pixelOffset] += delta.data[pixelOffset] * 2 - 255;
        source.data[pixelOffset + 1] += delta.data[pixelOffset + 1] * 2 - 255;
        source.data[pixelOffset + 2] += delta.data[pixelOffset + 2] * 2 - 255;
        source.data[pixelOffset + 3] = 255;
    }
}

SECONDS = 1000; // in ms
HEARTBEAT_TIME = 15 * SECONDS; // heartbeat every 15s
EVICTION_TIME = 30 * SECONDS; // evict automatically after 30s
// regex for detecting pomodoro control strings
POMODORO_REGEX = /^(:?for\s*)?\:\s*(\d{1,3})$/i;
// regex for detecting the ding at the end of a pomodoro. Won't detect "ding?"
// or its capitalisation variants.
// Optionally captures a break length
BREAK_REGEX = /^ding(:?\s+(:?for)?\s+:?(\d{1,2}))?\s*[.!]*$/i
// how often should we send I-frames?
IFRAME_INTERVAL = 0; // ALL THE DAMN TIME
// how fast should we upload video
VIDEO_FPS = 12;
MAX_NICK_LENGTH = 32;
// default break length in minutes
DEFAULT_BREAK_LENGTH = 8;

aliveHandle = undefined;
currentCamera = {
    // undefined stuff is just here as a reminder that it needs to be filled :-)
    ce: undefined,
    ve: undefined,
    enabled: false,
    lastIFrame: {
        frameData: undefined,
        time: 0,
    },
    objectURL: undefined,
    stream: undefined,
};

if (Meteor.isClient) {
    Template.cameras.hidden = false;

    Template.cameras.events({
        'click #expandcollapse': function() {
            /* XXX: There is probably a more elegant way of doing this (like
             * using session variables or something), so I should replace this
             * code once I've learnt more Meteor. */
            if (Template.cameras.hidden) {
                /* Expand div */
                $('#cameras').slideDown();
                $('#expandcollapse .fa-chevron-down').addClass('fa-chevron-up');
                $('#expandcollapse').removeClass('fa-chevron-down');
                Template.cameras.hidden = false;
            } else {
                /* Collapse div */
                $('#cameras').slideUp();
                $('#expandcollapse .fa-chevron-up').addClass('fa-chevron-down');
                $('#expandcollapse').removeClass('fa-chevron-up');
                Template.cameras.hidden = true;
            }
        },
        'click #enablecam': function(evt) {
            Meteor.call('enableCam', function(error, result) {
                if (!error && result) {
                    evt.currentTarget.id = 'disablecam';
                    currentCamera.enabled = true;

                    // AWESOME! Now we can set up the camera!
                    // XXX TODO: Refactor all of this as per TODO
                    navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;

                    if (!navigator.getUserMedia) {
                        // XXX tell the user that we've failed to get the webcam
                        // working
                        console.log('No WebRTC support detected :(');
                        return;
                    }

                    navigator.getUserMedia({video: true}, function(stream) {
                        if (!currentCamera.enabled) {
                            delete currentCamera.ve;
                            delete currentCamera.ce;
                            if (currentCamera.stream) {
                                currentCamera.stream.stop();
                            }
                            if (currentCamera.objectURL) {
                                URL.revokeObjectURL(currentCamera.objectURL);
                            }
                            delete currentCamera.objectURL;
                            return;
                        }
                        currentCamera.stream = stream;
                        currentCamera.ve = document.createElement('video');
                        currentCamera.objectURL = URL.createObjectURL(stream);
                        currentCamera.ve.src = currentCamera.objectURL;
                        currentCamera.ve.play();
                        currentCamera.ce = document.createElement('canvas');
                        currentCamera.ce.width = 320; // XXX
                        currentCamera.ce.height = 240; // XXX
                        function ivfunc() {
                            if (!currentCamera.enabled) {
                                delete currentCamera.ve;
                                delete currentCamera.ce;
                                if (currentCamera.stream) {
                                    currentCamera.stream.stop();
                                }
                                if (currentCamera.objectURL) {
                                    URL.revokeObjectURL(currentCamera.objectURL);
                                }
                                delete currentCamera.objectURL;
                                return;
                            }
                            var canvasAvailable = false;
                            try {
                                var ctx = currentCamera.ce.getContext('2d');
                                ctx.drawImage(currentCamera.ve, 0, 0, currentCamera.ce.width, currentCamera.ce.height);
                                var canvasAvailable = true;
                            } catch (ex) {
                                // do nothing but log, we get DOM errors
                                // sometimes :-(
                                //
                                // Google-able string: "NS_ERROR_NOT_AVAILABLE:
                                // Component not available". Google suggests
                                // that it's because the video frame isn't ready
                                // to draw (paradoxically).
                                //
                                // However, this exception is always thrown
                                // using incorrect line information (!!) when it
                                // happens in Firefox. It really happens here,
                                // or is triggered by the above code.
                                console.log('ivfunc() got error ' + ex);
                            }
                            var f = currentCamera.lastIFrame;
                            var now = new Date().getTime();
                            var msg = {type: 'i'};
                            if (f.time + IFRAME_INTERVAL < now || !f.frame && canvasAvailable) {
                                // Sending an I-frame
                                var ctx = currentCamera.ce.getContext('2d');
                                f.frame = ctx.getImageData(0, 0, currentCamera.ce.width, currentCamera.ce.height);
                                f.time = now;
                            } else if (canvasAvailable) {
                                // Send a Δ-frame
                                msg.type = 'Δ';
                                var ctx = currentCamera.ce.getContext('2d');
                                var data = ctx.getImageData(0, 0, currentCamera.ce.width, currentCamera.ce.height);
                                encodeFrameDelta(f.frame, data);
                                ctx.putImageData(f.frame, 0, 0);
                                f.frame = data;
                            }
                            msg.dataURL = currentCamera.ce.toDataURL('image/jpeg', 0.6)
                            Meteor.call('sendFrame', msg, function() {
                                // XXX do frame-rate limiting code
                                setTimeout(ivfunc, 1000 / VIDEO_FPS);
                            });
                        }
                        ivfunc();
                    }, function(error) {
                        // XXX Need to actually disable camera in this case.
                        console.log("Haven't got it :(");
                    });
                }
            });
        },
        'click #disablecam': function(evt) {
            Meteor.call('disableCam', function(error, result) {
                if (!error && result) {
                    currentCamera.enabled = false;
                    delete currentCamera.ve;
                    delete currentCamera.ce;
                    evt.currentTarget.id = 'enablecam';
                    if (currentCamera.stream) {
                        currentCamera.stream.stop();
                    }
                    if (currentCamera.objectURL) {
                        URL.revokeObjectURL(currentCamera.objectURL);
                        delete currentCamera.objectURL;
                    }
                }
            });
        },
    });

    Template.cameras.activeCameras = function() {
        // return uid + nick of everyone with an active cam
        return ActiveUsers.find({camEnabled: true});
    };

    Template.camera.created = function() {
        // logic for creating a camera
        // should set up a Deps.autorun handler for incoming webcam frames
        var thisTemplate = this;
        this._autorunHandle = Deps.autorun(function() {
            var uid = thisTemplate.data.uid;
            if (!uid) return;
            var frame = ActiveUsers.findOne({uid: uid}, {fields: {latestFrame: 1}});
            if (!frame) frame = {latestFrame: {type: null}};
            var frame = frame.latestFrame;
            try {
                var ce = thisTemplate.$('.camera')[0];
            } catch (ex) {
                console.log('Template.camera.created got DOM exception: ' + ex);
                return;
            }
            var ctx = ce.getContext('2d');
            // for now, I'll store everything in frame.dataURL and hope that
            // Socket.IO gzips everything on the wire :-)
            // I can probably confirm this myself at some point XXX
            if (frame.type == 'i' || frame.type == 'Δ') {
                var im = new Image();
                // NB: this all assumes that the given image is the same width
                // and height as our frame, or at least ratio-compatible with
                // it.
                if (frame.type == 'i') {
                    // I-frames carry the entire image, so we can draw it
                    // directly
                    im.onload = function() {
                        ctx.drawImage(this, 0, 0, ce.width, ce.height);
                    }
                } else {
                    // delta frames only carry a difference from the last image
                    im.onload = function() {
                        var currentData = ctx.getImageData(0, 0, ce.width, ce.height);
                        ctx.drawImage(this, 0, 0, ce.width, ce.height);
                        var deltaData = ctx.getImageData(0, 0, ce.width, ce.height);
                        applyFrameDelta(currentData, deltaData);
                        ctx.putImageData(currentData, 0, 0);
                    }
                }
                im.src = frame.dataURL;
            } else {
                console.log('Unknown frame type "' + frame.type + '" from UID ' + uid);
            }
        });
    };

    Template.camera.destroyed = function() {
        // logic for destroying a camera
        // should stop the Deps.autorun handler from .created()
        this._autorunHandle.stop();
    };

    Template.pomostatus.status = function() {
        return CurrentPomodoro.findOne({});
    };

    Template.pomostatus.toISO = function(ms) {
        var d = new Date();
        d.setTime(ms);
        return d.toISOString();
    };

    Template.pomostatus.toStateName = function(state) {
        switch (state) {
            case 'pomo':
                return 'Pomdoro';
            case 'break':
                return 'Break';
            default:
                return '??? WHAT IS THIS EVEN';
        }
    };

    Template.pomostatus.created = function() {
        var thisTemplate = this;

        this._timerHandle = Meteor.setInterval(function() {
            var timeElem = thisTemplate.$('time');
            var endpoint = new Date(timeElem.attr('datetime'));
            var now = new Date();
            var deltaSeconds = (endpoint - now)/1000;
            var minutes, seconds;
            if (deltaSeconds <= 0) {
                minutes = 0;
                seconds = 0;
            } else {
                minutes = parseInt(deltaSeconds / 60);
                seconds = parseInt(deltaSeconds % 60);
            }
            timeElem.children('.minutes').text(minutes);
            timeElem.children('.seconds').text(seconds);
        }, 500);
    };

    Template.pomostatus.destroyed = function() {
        Meteor.clearInterval(this._timerHandle);
    };

    Template.chatbox.rendered = function() {
        /* If we've got a nickname, use it. */
        var u = Meteor.user();
        var ne = this.$('#mynick input');
        if (u && u.profile && u.profile.nick) {
            ne.val(u.profile.nick);
        }
    };

    Template.chatbox.events = {
        'keyup #mynick input': function(e) {
            var nick = $(e.target).val();
            forceGetUser(function() {
                // XXX TODO prevent editing this directly.
                Meteor.call('setNick', nick);
                Meteor.call('alive');
            });
        },
        'keypress #msgin': function(e) {
            if (e.which !== 13) return;
            forceGetUser(function() {
                var elem = $("#msgin");
                var v = elem.val();
                if (v.length > 0) {
                    /* TODO: Pre-fill values */
                    var u = Meteor.user();
                    var rv = Meteor.call('say', {message: v,
                                        time: new Date().getTime(),
                                        nick: u.profile && u.profile.nick ? u.profile.nick : '',
                                        uid: Meteor.userId()});
                }
                elem.val('');
            });
        },
    };

    Template.chatbox.messages = function() {
        return Messages.find({}, {sort: {time: 1}});
    };

    Template.chatbox.occupants = function() {
        return ActiveUsers.find({});
    };

    Meteor.startup(function() {
        Deps.autorun(function() {
            // TODO: is this actually working? I have no idea, but I suspect
            // it's triggering a Meteor bug when it tries to run alive() :(
            // Actually, this could fix our problem with active users getting
            // kicked off when another login sends dead(). Since the dead() will
            // update ActiveUsers, we *might* get this to re-run. This requires
            // some changes here, so XXX
            forceGetUser(function() {
                Deps.autorun(_.partial(Meteor.call, 'alive'));
            });
        });
        /* Heartbeats */
        aliveHandle = Meteor.setInterval(function() {
            Meteor.call('alive');
        }, HEARTBEAT_TIME);
        window.onbeforeunload = function(e) {
            if (aliveHandle) Meteor.clearInterval(aliveHandle);
            Meteor.call('dead');
        };
    });
}

if (Meteor.isServer) {
    Meteor.startup(function () {
        Messages.remove({});
        ActiveUsers.remove({});
        CurrentPomodoro.remove({});
    });

    // useful for setting denials/acceptances
    var _rt = function(){return true;};
    // XXX prevent users from editing their user data from the client.
    // Especially the nickname.
    // At the moment it's a gaping hole in the app :P

    // XXX turn off autopublish before deploy and add this in
    // also get the other collections and autopublish them
    /*Meteor.publish('messages', function() {
        return Messages.find({}, {sort: {time: -1}, limit: 200});
    });*/

    Meteor.methods({
        alive: alive,
        dead: kill,
        say: function(doc) {
            doc.time = new Date().getTime();
            doc.uid = Meteor.userId();
            var u = Meteor.user();
            if (u.profile && u.profile.nick) {
                doc.nick = u.profile.nick;
            } else {
                doc.nick = '<empty nickname>';
            }
            check(doc, {
                uid: String,
                message: String,
                time: Number,
                nick: Match.Optional(String)
            });
            Messages.insert(doc);
            // TODO: write a message out explaining that a pomodoro has been
            // started
            // Note that startPomo/startBreak actually check whether the current
            // break/pomodoro has expired.
            var match = POMODORO_REGEX.exec(doc.message);
            if (match && match[2]) {
                var time = parseInt(match[2]);
                if (time <= 0 || time > 999) return true;
                return !!startPomo(time);
            }
            var match = BREAK_REGEX.exec(doc.message);
            if (match) {
                var time = DEFAULT_BREAK_LENGTH;
                if (match[2]) {
                    time = parseInt(match[2]);
                    if (time <= 0 || time > 99) return true;
                }
                return !!startBreak(time);
            }
            return true;
        },
        enableCam: function() {
            // XXX should alive() or do something sensible if the user is not in
            // actives
            var uid = Meteor.userId();
            return ActiveUsers.update({uid: uid}, {$set: {camEnabled: true}}) > 0;
        },
        disableCam: function() {
            var uid = Meteor.userId();
            return ActiveUsers.update({uid: uid}, {$set: {camEnabled: false}}) > 0;
        },
        sendFrame: function(msg) {
            var uid = Meteor.userId();
            if (!uid) {
                console.log('No UID in frame upload code :(');
                return false;
            }
            check(msg, {
                dataURL: String,
                type: String,
            });
            return ActiveUsers.update({uid: uid}, {$set: {latestFrame: msg}}) > 0;
        },
        setNick: function(nick) {
            check(nick, String);
            nick = nick.slice(0, MAX_NICK_LENGTH);
            nick = nick.trim();
            if (nick.length < 1) return false;
            return Meteor.users.update({_id: Meteor.userId()},
                    {$set: {profile:
                               {nick: nick}}}
            ) > 0;
        }
    });

    Meteor.setInterval(function() {
        var removeTime = new Date().getTime() - EVICTION_TIME;
        var to_delete = ActiveUsers.find({lastSeen: {$lt: removeTime}});
        to_delete.forEach(function(active) {
            kill(active.uid);
        });
    }, HEARTBEAT_TIME);
}
