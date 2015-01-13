function EchoesUi() {
    EchoesObject.call(this, 'ui');

    this.assets = {
        encrypt: {
            unencrypted: '/client/assets/unencrypted.png',
            encrypted: '/client/assets/encrypted.png',
            oneway: '/client/assets/oneway.png',
        }
    }

    this.ui = {
        wall: $("#wall"),
        echoes: $("#echoes"),
        input: $('#echo_input'),
        me_input: $('#me_input'),
        me: $('#me'),
        channels: $('#channels'),
        nicknames: $('#channels'),
        form: $('form'),
        buttons: {
            nicknames: $('#menu_nicknames'),
            channels: $('#menu_channels'),
            encrypt: $('#encrypt_img'),
        },
        lists: {
            close_lists: $('#close_lists'),
            nicknames: $('#nicknames'),
            channels: $('#channels'),
        }
    }

    this.attach_events();
}

EchoesUi.prototype = Object.create(EchoesObject.prototype); // inherit EchoesObject
EchoesUi.prototype.constructor = EchoesUi;

EchoesUi.prototype.attach_events = function() {
    var self = this;

    this.ui.lists.close_lists.click(function() {
        self.ui.lists.close_lists.hide();
        self.ui.lists.nicknames.hide("slide", { direction: "right" }, 100);
        self.ui.lists.channels.hide("slide", { direction: "left" }, 100);

        self.ui.input.focus();
    });

    this.ui.buttons.nicknames.click(function() {
        self.ui.lists.close_lists.show();
        self.ui.lists.nicknames.toggle("slide", { direction: "right" }, 100);

        self.ui.input.focus();
    });
    this.ui.buttons.channels.click(function() {
        self.ui.lists.close_lists.show();
        self.ui.lists.channels.toggle("slide", { direction: "left" }, 100);

        self.ui.input.focus();
    });

    this.ui.lists.channels.on('click', 'li', function() {
        self.show_window($(this).attr('windowname'));
        self.ui.buttons.channels.click();
    });
    this.ui.lists.nicknames.on('click', 'li', function() {
        var nick = $(this).attr('windowname');
        self.add_window(nick);
        self.show_window(nick);
        self.ui.lists.close_lists.click();
    });

    this.show_window(this.ui.echoes.attr('windowname'));
}

EchoesUi.prototype.scroll_down = function() {
    this.ui.wall.scrollTop(this.ui.wall.prop("scrollHeight"));
};

EchoesUi.prototype.echo = function(echo, where, and_echoes) {
    where = (typeof where == 'string' ? where : $(this.active_window()).attr('windowname'));
    and_echoes = (and_echoes && where != this.ui.echoes.attr('windowname') ? true : false);

    var li =
        $('<li>')
            .text(echo);

    this.get_window(where).append(li);
    if (and_echoes) {
        li.clone().appendTo(this.get_window(this.ui.echoes.attr('windowname')));
    }

    this.scroll_down();
    this.ui.input.focus();
};

EchoesUi.prototype.status = function(status, where, and_echoes) {
    this.echo('* ' + status, where, and_echoes);
};

EchoesUi.prototype.error = function(error, where, and_echoes) {
    this.status('ERROR: ' + error, where, and_echoes);
};

EchoesUi.prototype.active_window = function() {
    return this.ui.wall.find('ul:visible');
}

EchoesUi.prototype.joined_channels = function() {
    return this.ui.lists.channels.find('li:not([windowname="' + this.ui.echoes.attr('windowname') + '"])');
}
EchoesUi.prototype.opened_windows = function() {
    return this.ui.wall.find('ul');
}

EchoesUi.prototype.remove_channel = function(chan) {
    this.ui.lists.channels.find('li[windowname="' + chan + '"]').remove();
}
EchoesUi.prototype.remove_nickname = function(nick) {
    this.ui.lists.nickname.find('li[windowname="' + nick + '"]').remove();
}

EchoesUi.prototype.clear_channels = function() {
    this.ui.lists.channels.html('');
}
EchoesUi.prototype.clear_nicknames = function() {
    this.ui.lists.nicknames.html('');
}

EchoesUi.prototype.add_channel = function(chan) {
    if (this.ui.channels.find('li[windowname="' + chan + '"]').length > 0) {
        return;
    }

    var chan_element =
        $('<li>')
            .attr('windowname', chan)
            .text(chan)

    this.ui.lists.channels.append(chan_element);
    this.add_window(chan);
}

EchoesUi.prototype.add_nickname = function(nick) {
    if (this.ui.nicknames.find('li[windowname="' + nick + '"]').length > 0) {
        return;
    }

    var nick_element =
        $('<li>')
            .attr('windowname', nick)
            .text(nick)

    this.ui.lists.nicknames.append(nick_element);
}

EchoesUi.prototype.add_window = function(name) {
    if (this.ui.wall.find('ul[windowname="' + name + '"]').length > 0) {
        return;
    }

    this.ui.wall.append(
        $('<ul>')
            .attr('windowname', name)
            .css('display', 'none')
    );

    this.echo('Say hi to ' + name, name)
}
EchoesUi.prototype.remove_window = function(name) {
    this.ui.wall.find('ul[windowname="' + name + '"]').remove();
}

EchoesUi.prototype.get_window = function(name) {
    return this.ui.wall.find('ul[windowname="' + name + '"]');
}

EchoesUi.prototype.set_window_state = function(state, on_window) { // encrypted, unencrypted, oneway
    switch (state) {
        case 'encrypted':
        case 'oneway':
            this.log('setting src to ' + this.assets.encrypt[state])
            this.ui.buttons.encrypt.attr('src', this.assets.encrypt[state]).attr('alt', state);
            this.get_window(on_window).attr('encryptionstate', state);
        break;
        default:
            this.ui.buttons.encrypt.attr('src', this.assets.encrypt.unencrypted).attr('alt', 'unencrypted');
            this.get_window(on_window).attr('encryptionstate', 'unencrypted');
        break;
    }

}
EchoesUi.prototype.get_window_state = function(on_window) {
    var state = this.get_window(on_window).attr('encryptionstate');
    return (state ? state : 'unencrypted');
}

EchoesUi.prototype.show_window = function(name) {
    var self = this;

    this.ui.lists.channels.find('li').removeClass('theme_selected_window');
    this.ui.lists.nicknames.find('li').removeClass('theme_selected_window');
    this.ui.lists.channels.find('li[windowname="' + name + '"]').addClass('theme_selected_window');
    this.ui.lists.nicknames.find('li[windowname="' + name + '"]').addClass('theme_selected_window');

    this.ui.wall.find('ul:visible').hide();
    this.ui.wall.find('ul[windowname="' + name + '"]').show(function() {
        if (! $(this).attr('windowname').match(/^(\)\)\)|#.*)/gi)) {
            self.set_window_state($(this).attr('encryptionstate'), $(this).attr('windowname'));
            self.ui.buttons.encrypt.fadeIn('fast');
        } else {
            self.ui.buttons.encrypt.fadeOut('fast');
        }
    });

    this.scroll_down();
    this.ui.input.focus();

}

EchoesUi.prototype.get_me = function(message) {
    var self = this;
    message = message || 'What do they call you?';

    this.ui.me_input.attr('placeholder', '');
    this.ui.me_input.val('');
    this.ui.me.fadeIn('fast', function() {
        self.ui.me_input.attr('placeholder', message);
    });
    this.ui.me_input.focus();
}

EchoesUi.prototype.hide_me = function() {
    this.ui.me_input.val(':)');
    this.ui.me.fadeOut('slow');
}
