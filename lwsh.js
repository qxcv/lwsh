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
        Session.set('pomodoro_status', {type: 'running', name: 'Pomodoro running', until: '2014-06-15T13:00Z'});
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
        }
    };
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // code to run on server at startup
  });
}
