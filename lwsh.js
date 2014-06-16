Messages = new Meteor.Collection("messages");

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
    Session.set('username', username);
    Session.set('password', password);
    return Accounts.createUser({
        username: username,
        password: password
    }, cb);
}

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

        this._timer_handle = Meteor.setInterval(function() {
            var time_elem = this.$('time');
            var endpoint = new Date(time_elem.attr('datetime'));
            var now = new Date();
            var delta_seconds = (endpoint - now)/1000;
            var minutes, seconds;
            if (delta_seconds <= 0) {
                minutes = 0;
                seconds = 0;
            } else {
                minutes = parseInt(delta_seconds / 60);
                seconds = parseInt(delta_seconds % 60);
            }
            time_elem.children('.minutes').text(minutes);
            time_elem.children('.seconds').text(seconds);
        }, 500);
    };

    Template.pomostatus.destroyed = function() {
        Meteor.clearInterval(this._timer_handle);
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
            });
        },
        'keypress #msgin': function(e) {
            if (e.which !== 13) return;
            forceGetUser(function() {
                var elem = $("#msgin");
                var v = elem.val();
                if (v.length > 0) {
                    Messages.insert({uid: Meteor.userId(),
                                     message: v});
                }
                elem.val('');
            });
        }
    };

    Template.chatbox.messages = function() {
        return Messages.find({}, {sort: {time: 1}});
    };
}

if (Meteor.isServer) {
    Meteor.startup(function () {
        Messages.remove({});
    });

    var _rt = function(){return true;};
    Messages.deny({
        remove: _rt,
        update: _rt
    });

    Messages.allow({
        insert: function(uid, doc) {
            doc.time = new Date().valueOf();
            var u = Meteor.user();
            if (u.profile && u.profile.nick) {
                doc.nick = u.profile.nick;
            }
            check(doc, {
                uid: String,
                message: String,
                time: Number,
                nick: Match.Optional(String)
            });
            return doc.uid === Meteor.userId();
        }
    });

    // XXX turn off autopublish before deploy and add this in
    /*Meteor.publish('messages', function() {
        return Messages.find({}, {sort: {time: -1}, limit: 200});
    });*/
}
