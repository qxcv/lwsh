Messages = new Meteor.Collection("messages");
ActiveUsers = new Meteor.Collection("actives");

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
    return Accounts.createUser({
        username: username,
        password: password
    }, cb);
}

SECONDS = 1000;
HEARTBEAT_TIME = 15 * SECONDS; // heartbeat every 15s
EVICTION_TIME = 30 * SECONDS; // evict automatically after 30s

var aliveHandle = undefined;

if (Meteor.isClient) {
    Template.cameras.hidden = false;
    Template.cameras.events({
        'click #expandcollapse': function(templ) {
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
        'click #cameraoptions': function() {
            // toggle webcam broadcast
        }
    });

    if (Session.get('pomodoro_status') === undefined) {
        Session.set('pomodoro_status',
                {type: 'running',
                 name: 'Pomodoro running',
                 until: '2038-01-19T03:14Z'});
    }

    Template.pomostatus.status = function() {
        return Session.get('pomodoro_status');
    };

    Template.pomostatus.created = function() {
        var thing = this;

        this._timerHandle = Meteor.setInterval(function() {
            var timeElem = this.$('time');
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
        // notify the server that we exist
        Meteor.call('alive');
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
            Meteor.call('alive');
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
        // TODO: what if there are other clients connected with the same uid?
        Messages.remove({});
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
    /*Meteor.publish('messages', function() {
        return Messages.find({}, {sort: {time: -1}, limit: 200});
    });*/

    Meteor.methods({
        alive: function() {
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
                Deps.autorun(function() {
                    forceGetUser(function() {
                        Meteor.call('alive');
                    });
                });
            }
            return null;
        },
        dead: function() {
            var uid = Meteor.userId();
            ActiveUsers.remove({uid: uid});
        },
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
            /* TODO: check the incoming message for pomodoro timer control
             * strings.  I may want to split this out into a server method
             * before I do that, though, since it doesn't make a lot of sense to
             * be putting globs of logic into a .allow() clause :-) */
            return true;
        },
    });

    Meteor.setInterval(function() {
        var removeTime = new Date().getTime() - EVICTION_TIME;
        ActiveUsers.remove({lastSeen: {$lt: removeTime}});
    }, HEARTBEAT_TIME);
}
