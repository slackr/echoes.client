function EchoesUi() {
    EchoesObject.call(this, 'ui');

    this.ui = {
        wall: $("#wall"),
        echoes: $("#echoes"),
        input: $('#echo_input'),
        me_input: $('#me_input'),
        me: $('#me'),
        channels: $('#channels'),
        form: $('form'),
        buttons: {
            nicknames: $('#menu_nicknames'),
            channels: $('#menu_channels'),
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
    });
    this.ui.buttons.channels.click(function() {
        self.ui.lists.close_lists.show();
        self.ui.lists.channels.toggle("slide", { direction: "left" }, 100);
    });

    this.ui.lists.channels.on('click', 'li', function() {
        self.select_channel(this);
    });
}

EchoesUi.prototype.scroll_down = function() {
    this.ui.wall.scrollTop(this.ui.wall.prop("scrollHeight"));
};

EchoesUi.prototype.echo = function(echo) {
    this.ui.echoes.append(
        $('<li>')
            .text(echo)
    );

    this.scroll_down();
    this.ui.input.focus();
};

EchoesUi.prototype.status = function(status) {
    this.echo('* ' + status)
};

EchoesUi.prototype.error = function(error) {
    this.status('ERROR: ' + error);
};

EchoesUi.prototype.active_channel = function() {
    return this.ui.channels.find('li[selected="selected"]');
}

EchoesUi.prototype.joined_channels = function() {
    return this.ui.channels.find('li');
}

EchoesUi.prototype.remove_channel = function(chan) {
    this.ui.lists.channels.find('li:contains("' + chan + '")').remove();
}

EchoesUi.prototype.clear_channels = function() {
    this.ui.lists.channels.html('');
}

EchoesUi.prototype.add_channel = function(chan) {
    var chan_element =
        $('<li>')
            .text(chan)

    this.ui.lists.channels.append(chan_element);
    this.select_channel(chan_element);
}

EchoesUi.prototype.select_channel = function(chan_element) {
    this.joined_channels().removeClass('selected_channel');
    $(chan_element).addClass('selected_channel').attr('selected','selected');
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
