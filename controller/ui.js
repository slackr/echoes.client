/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * UI controller that handles CRUD operations on UI elements
 *
 * @class
 * @extends EchoesObject
 */
function EchoesUi() {
    EchoesObject.call(this, 'ui');

    this.assets = {
        encrypt: {
            unencrypted: $('#icon_unencrypted'),
            encrypted: $('#icon_encrypted'),
            oneway: $('#icon_oneway'),
        }
    }

    this.ui = {
        wall: $("#wall"),
        echoes: $("#echoes"),
        input: $('#echo_input'),
        current_window_name: $('#current_window_name'),
        buttons: {
            nicknames: $('#menu_nicknames'),
            channels: $('#menu_channels'),
            encrypt: $('#encrypt'),
        },
        lists: {
            close_lists: $('#close_lists'),
            nicknames: $('#nicknames'),
            channels: $('#channels'),
        },
        popup: {
            window: $('#popup'),
            title: $('#popup_title'),
            message: $('#popup_message'),
            wrapper: $('#popup_wrapper'),
            yes: $('#popup_yes'),
            no: $('#popup_no'),
        },
        show_window_callback: null, // function to call after show_window()
    }

    this.attach_events();
}
EchoesUi.prototype = Object.create(EchoesObject.prototype);
EchoesUi.prototype.constructor = EchoesUi;

/**
 * Attaches required events to UI elements
 * Displays the echoes window at the end
 *
 * @returns {null}
 */
EchoesUi.prototype.attach_events = function() {
    var self = this;

    this.ui.lists.close_lists.click(function() {
        self.ui.lists.close_lists.hide();
        self.ui.lists.nicknames.hide("slide", { direction: "right" }, 100);
        self.ui.lists.channels.hide("slide", { direction: "left" }, 100);

        self.ui.input.focus();
    });

    this.ui.buttons.nicknames.click(function() {
        self.ui.lists.nicknames.toggle("slide", { direction: "right" }, 100, function() {
            self.ui.lists.close_lists.toggle(self.ui.lists.channels.is(':visible') || self.ui.lists.nicknames.is(':visible'));
        });

        self.ui.input.focus();
    });
    this.ui.buttons.channels.click(function() {
        self.ui.lists.channels.toggle("slide", { direction: "left" }, 100, function() {
            self.ui.lists.close_lists.toggle(self.ui.lists.channels.is(':visible') || self.ui.lists.nicknames.is(':visible'));
        });

        self.ui.input.focus();
    });

    this.ui.lists.channels.on('click', 'li', function() {
        self.show_window($(this).attr('windowname'));
        self.ui.lists.close_lists.click();
    });
    this.ui.lists.nicknames.on('click', 'li', function() {
        var nick = $(this).attr('windowname');
        self.add_window(nick, 'nickname');
        self.show_window(nick);
        self.ui.lists.close_lists.click();

        if (typeof  self.ui.show_window_callback == 'function') {
            self.ui.show_window_callback(nick);
        }
    });

    this.show_window(this.ui.echoes.attr('windowname'));
}

/**
 * Scrolls the wall down
 *
 * @returns {null}
 */
EchoesUi.prototype.scroll_down = function() {
    var win = this.ui.wall;
    win.scrollTop(win.prop("scrollHeight"));
};

/**
 * Creates echo element on wall
 *
 * @param   {string} echo       Text to add to text node
 * @param   {string} where      Window name to display to, if null display in active window
 * @param   {bool} and_echoes   Also display in the echoes window
 * @param   {string} add_class  (default='ui_echo') A list of CSS classes separated by space to add to element
 *
 * @returns {null}
 */
EchoesUi.prototype.echo = function(echo, where, and_echoes, add_class) {
    add_class = add_class || 'ui_echo';
    where = (typeof where == 'string' ? where : $(this.active_window()).attr('windowname'));
    and_echoes = (and_echoes && where != this.ui.echoes.attr('windowname') ? true : false);

    var li =
        $('<li>')
            .addClass(add_class)
            .hide()
            .text(echo);

    li.appendTo(this.get_window(where))
        .fadeIn('fast');

    if (and_echoes) {
        li
            .clone()
            .css('opacity', 1) // wtf is setting the opacity to 0?
            .appendTo(this.get_window(this.ui.echoes.attr('windowname')));
    }

    this.scroll_down();
    this.ui.input.focus();
};

/**
 * A wrapper to display a status echo
 *
 * @see EchoesUi#echo
 *
 * @returns {null}
 */
EchoesUi.prototype.status = function(status, where, and_echoes) {
    this.echo(status, where, and_echoes, ' ');
};

/**
 * A wrapper to display an error echo
 *
 * error can be string or object:
 *
 * if object = { error: 'message', debug: 'detailed message' }
 *
 * *.debug will be attached if AppConfig.LOG_LEVEL is 0
 *
 * @param   {string|object} Error message to display with an optional debug attached if object
 *
 * @see EchoesUi#echo
 *
 * @returns {null}
 */
EchoesUi.prototype.error = function(error, where, and_echoes) {
    var error_out = error;
    if (typeof error == 'object') {
        error_out = error.error + (AppConfig.LOG_LEVEL == 0 ? ' (' + error.debug + ')' : '');
    }
    this.echo(error_out, where, and_echoes, 'ui_error');
};

/**
 * Find the active window element and return it as jquery object
 *
 * @returns {object[]} jQuery object array (hopefully just one...) or []
 */
EchoesUi.prototype.active_window = function() {
    return this.ui.wall.find('ul:visible');
}

/**
 * Find all the joined channels using windowtype element property
 *
 * @returns {object[]} jQuery object array or []
 */
EchoesUi.prototype.joined_channels = function() {
    return this.ui.wall.find('ul[windowtype="channel"]');
}

/**
 * Find all the opened windows
 *
 * @returns {object[]} jQuery object array or []
 */
EchoesUi.prototype.opened_windows = function() {
    return this.ui.wall.find('ul');
}

/**
 * Remove a channel element from the channels list using the windowname element property
 *
 * @param   {string} chan Channel to remove
 *
 * @returns {null}
 */
EchoesUi.prototype.remove_channel = function(chan) {
    this.ui.lists.channels.find('li[windowname="' + chan + '"]').remove();
}

/**
 * Remove a nickname element from the nicknames list using the windowname element property
 *
 * @param   {string} nick Nickname to remove
 *
 * @returns {null}
 */
EchoesUi.prototype.remove_nickname = function(nick) {
    this.ui.lists.nicknames.find('li[windowname="' + nick + '"]').remove();
}

/**
 * Empty the channels list
 *
 * @returns {null}
 */
EchoesUi.prototype.clear_channels = function() {
    var self = this;

    this.ui.wall.find('ul[windowtype="channel"]').each(function() {
        self.ui.lists.channels.find('li[windowname="' + $(this).attr('windowname') + '"]').remove();
    });
}
/**
 * Empty the nicknames list
 *
 * @returns {null}
 */
EchoesUi.prototype.clear_nicknames = function() {
    this.ui.lists.nicknames.html('');
}

/**
 * Add a channel element to the channels list if it doesn't exist already
 * Also adds a 'channel' type window
 * Does not show the window
 *
 * @param   {string} chan Which name to use
 *
 * @returns {null}
 */
EchoesUi.prototype.add_channel = function(chan) {
    if (this.ui.lists.channels.find('li[windowname="' + chan + '"]').length > 0) {
        return;
    }

    var chan_element =
        $('<li>')
            .attr('windowname', chan)
            .text(chan)

    this.ui.lists.channels.append(chan_element);
    this.add_window(chan, 'channel');
}

/**
 * Adds a nickname element to the nicknames list if it doesn't exist already
 * Does NOT add a nickname window, this will happen on click() event
 *
 * @param   {string} nick Which name to use
 *
 * @returns {null}
 */
EchoesUi.prototype.add_nickname = function(nick) {
    if (this.ui.lists.nicknames.find('li[windowname="' + nick + '"]').length > 0) {
        return;
    }

    var nick_element =
        $('<li>')
            .attr('windowname', nick)
            .text(nick)

    this.ui.lists.nicknames.append(nick_element);
}

/**
 * Creates a new hidden window if it doesn't exist already
 * Adds a welcome status to 'nickname' types
 *
 * Type can be: 'nickname' or 'channel'
 *
 * The default type is 'channel'
 *
 * @param   {string} name Window name to use
 * @param   {string} type     (default='channel') Type of window (eg: nickname or channel)
 *
 * @returns {Type} Description
 */
EchoesUi.prototype.add_window = function(name, type) {
    type = type || 'channel';

    if (this.ui.wall.find('ul[windowname="' + name + '"]').length > 0) {
        return;
    }

    this.ui.wall.append(
        $('<ul>')
            .attr('windowname', name)
            .attr('windowtype', type)
            .css('display', 'none')
    );

    if (type == 'nickname') {
        this.status('Say hi to ' + name, name);
    }
}

/**
 * Remove window by windowname property
 *
 * @param   {string} name Window name to remove
 *
 * @returns {null}
 */
EchoesUi.prototype.remove_window = function(name) {
    this.ui.wall.find('ul[windowname="' + name + '"]').remove();
}

/**
 * Retrieve a window by windowname property
 *
 * Returns a jQuery object of the window
 *
 * @param   {string} name Window name
 *
 * @returns {object[]} jQuery object array of window or [] if nothing found
 */
EchoesUi.prototype.get_window = function(name) {
    return this.ui.wall.find('ul[windowname="' + name + '"]');
}

/**
 * Sets the encryptionstate property for a window
 *
 * The allowed states:
 * encrypted
 * unencrypted
 * oneway
 *
 * @param   {string} state    The state of the window
 * @param   {string} on_window   Window name to set the state on
 *
 * @returns {null}
 */
EchoesUi.prototype.set_window_state = function(state, on_window) { // encrypted, unencrypted, oneway
    switch (state) {
        case 'encrypted':
        case 'oneway':
        break;
        default:
            state = 'unencrypted';
        break;
    }

    this.get_window(on_window).attr('encryptionstate', state);
}

/**
 * Get the window encryptionstate value
 *
 * @param   {string} on_window Window name
 *
 * @returns {string} Encryption state (if null return 'unencrypted')
 */
EchoesUi.prototype.get_window_state = function(on_window) {
    var state = this.get_window(on_window).attr('encryptionstate');
    return (state ? state : 'unencrypted');
}

/**
 * Shows a window on the wall and hides all others
 * Also sets the CSS ui selected window property in the nickname/channel list
 * Also calls EchoesUi#scroll_down and focuses the input echo_input
 * Also changes the current_window_name position based on type of window
 *
 * @see EchoesUi#scroll_down
 *
 * @param   {string} name Window name
 *
 * @returns {null}
 */
EchoesUi.prototype.show_window = function(name) {
    var self = this;

    this.ui.lists.channels.find('li').removeClass('ui_selected_window');
    this.ui.lists.nicknames.find('li').removeClass('ui_selected_window');
    this.ui.lists.channels.find('li[windowname="' + name + '"]').addClass('ui_selected_window');
    this.ui.lists.nicknames.find('li[windowname="' + name + '"]').addClass('ui_selected_window');

    this.ui.wall.find('ul:visible').hide();
    self.ui.current_window_name.fadeOut('fast');

    this.ui.wall.find('ul[windowname="' + name + '"]').fadeIn('fast', function() {

        self.ui.current_window_name.text(name);

        if ($(this).attr('windowtype') == 'nickname') {
            self.toggle_encrypt_icon(true);
        } else {
            self.toggle_encrypt_icon(false);
        }

        self.ui.current_window_name.fadeIn('fast');

        self.scroll_down();
        self.ui.input.focus();
    });
}

/**
 * Show or hide the encryption icon near the input.
 * Slides the input cursor 30px on show()
 *
 * @param   {bool} on_off On or off
 *
 * @returns {null}
 */
EchoesUi.prototype.toggle_encrypt_icon = function(on_off) {
    var padding = '35px';
    if (on_off) {
        this.ui.buttons.encrypt.fadeIn('fast');
        this.ui.input.css('padding-left', padding);
    } else {
        this.ui.input.css('padding-left', '0px');
        this.ui.buttons.encrypt.fadeOut('fast');
    }
}

/**
 * Displays a popup with an optional title or message
 *
 * If a yes_/no_callback is specified, it is called before popup_close() on 'click'
 *
 * If no "no" button text is specified, the button is hidden
 * The "yes" button text will default to "CLOSE"
 *
 * @param   {string} title     (optional) Title of popup
 * @param   {string} message    (optional) Message to display
 * @param   {string} yes_text     (optional) Text to display in YES button
 * @param   {string} no_text      (optional) Text to display in NO button
 * @param   {function} yes_callback (optional) Function to call after YES onclick
 * @param   {function} no_callback  (optional) Function to call after NO onclick
 *
 * @returns {null}
 */
EchoesUi.prototype.popup = function(title, message, yes_text, no_text, yes_callback, no_callback) {
    var self = this;

    this.ui.popup.no.off('click');
    this.ui.popup.yes.off('click');

    if (title) {
        this.ui.popup.title.show().text(title);
    } else {
        this.ui.popup.title.hide();
    }
    if (typeof message == 'string') {
        if (message.length > 0) {
            this.ui.popup.message.text(message);
        }
        this.ui.popup.message.show();
    } else {
        this.ui.popup.message.hide();
    }

    this.ui.popup.yes.show().text(yes_text || "CLOSE");
    this.ui.popup.yes.on('click', function() {
        if (typeof yes_callback == 'function') {
            yes_callback();
        } else {
            self.popup_close();
        }
    });

    if (no_text) {
        this.ui.popup.no.show().text(no_text);
        this.ui.popup.no.on('click', function() {
            if (typeof no_callback == 'function') {
                no_callback();
            } else {
                self.popup_close();
            }
        });
    } else {
        this.ui.popup.no.hide();
    }

    this.ui.popup.window.show();
    this.popup_center();
}

/**
 * Close the popup window
 *
 * @returns {null}
 */
EchoesUi.prototype.popup_close = function() {
    this.ui.popup.window.hide();
}

EchoesUi.prototype.popup_center = function() {
    // center div
    this.ui.popup.wrapper.css('margin-top', -this.ui.popup.wrapper.outerHeight()/2 + 'px');
    this.ui.popup.wrapper.css('margin-left', -this.ui.popup.wrapper.outerWidth()/2 + 'px');
}
