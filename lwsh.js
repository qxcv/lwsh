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

function startPomo(time) {
    // if there's no pomo running at the moment, start one.
    var pomo = CurrentPomodoro.findOne({});
    var now = new Date().getTime();
    var method = undefined;
    var doc = {
            ends: now + 60 * 1000 * time,
            duration: time,
            type: 'pomo'
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

function encodeFrameDelta(i1, i2, dest) {
    for (var pixelOffset = 0; pixelOffset < i1.data.length; pixelOffset += 4) {
        dest.data[pixelOffset] = (i1.data[pixelOffset] - i2.data[pixelOffset] + 255) / 2;
        dest.data[pixelOffset + 1] = (i1.data[pixelOffset + 1] - i2.data[pixelOffset + 1] + 255) / 2;
        dest.data[pixelOffset + 2] = (i1.data[pixelOffset + 2] - i2.data[pixelOffset + 2] + 255) / 2;
        dest.data[pixelOffset + 3] = 255;
    }
}

function applyFrameDelta(source, delta) {
    for (var pixelOffset = 0; pixelOffset < source.data.length; pixelOffset += 4) {
        source.data[pixelOffset] += delta.data[pixelOffset] * 2 - 255;
        source.data[pixelOffset + 1] += delta.data[pixelOffset + 1] * 2 - 255;
        source.data[pixelOffset + 2] += delta.data[pixelOffset + 2] * 2 - 255;
        source.data[pixelOffset + 3] = 255;
    }
}

SECONDS = 1000;
HEARTBEAT_TIME = 15 * SECONDS; // heartbeat every 15s
EVICTION_TIME = 30 * SECONDS; // evict automatically after 30s
POMODORO_REGEX = /^(:?for\s*)?\:\s*(\d{1,3})$/i;

var aliveHandle = undefined;

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
                $('#expandcollapse').addClass('fa-chevron-up');
                $('#expandcollapse').removeClass('fa-chevron-down');
                Template.cameras.hidden = false;
            } else {
                /* Collapse div */
                $('#cameras').slideUp();
                $('#expandcollapse').addClass('fa-chevron-down');
                $('#expandcollapse').removeClass('fa-chevron-up');
                Template.cameras.hidden = true;
            }
        },
        'click #enablecam': function(evt) {
            Meteor.call('enableCam', function(error, result) {
                if (!error && result) {
                    evt.currentTarget.id = 'disablecam';
                }
            });
        },
        'click #disablecam': function(evt) {
            Meteor.call('disableCam', function(error, result) {
                if (!error && result) {
                    evt.currentTarget.id = 'enablecam';
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
            if (!frame) frame = {type: null};
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
                        var currentData = ctx.getImageData();
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
                return '???';
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
                Meteor.users.update({_id: Meteor.userId()},
                        {$set: {profile:
                                   {nick: nick}}}
                );
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

    var _rt = function(){return true;};
    Messages.deny({
        remove: _rt,
        update: _rt
    });

    ActiveUsers.deny({
        remove: _rt,
        update: _rt,
        insert: _rt
    });

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
            var match = POMODORO_REGEX.exec(doc.message);
            if (match && match[2]) {
                var time = parseInt(match[2]);
                if (time <= 0 || time > 999) return true;
                return !!startPomo(time);
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
