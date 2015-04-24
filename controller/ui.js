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
            icon_class: {
                unencrypted: 'ui_echo_unencrypted_icon',
                encrypted: 'ui_echo_encrypted_icon',
                oneway: 'ui_echo_oneway_icon',
            }
        },
        echo: {
            icon_class: {
                broadcast: 'ui_echo_broadcast_icon',
            }
        }
    };

    this.ui = {
        wall: $("#wall"),
        echoes: $("#echoes"),
        input: $('#echo_input'),
        window_title: $('#window_title'),
        buttons: {
            nicknames: $('#menu_nicknames'),
            windows: $('#menu_windows'),
            exit: $('#menu_exit'),
            encrypt: $('#encrypt'),
            send: $('#send'),
        },
        lists: {
            close_lists: $('#close_lists'),
            nicknames: $('#nicknames'),
            windows: $('#windows'),
        },
        popup: {
            window: $('#popup'),
            title: $('#popup_title'),
            message: $('#popup_message'),
            wrapper: $('#popup_wrapper'),
            yes: $('#popup_yes'),
            no: $('#popup_no'),
        },
        notification: {
            bubble_all: $('#noti_bubble_all')
        },
        progress_bar: $('#progress_bar'),
        show_window_callback: null, // function to call after show_window()
    };

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
        self.ui.lists.windows.hide("slide", { direction: "left" }, 100);
        self.ui.buttons.nicknames.removeClass('clicked');
        self.ui.buttons.windows.removeClass('clicked');

        self.ui.input.focus();
    });

    this.ui.buttons.nicknames.click(function() {
        self.ui.lists.nicknames.toggle("slide", { direction: "right" }, 100, function() {
            self.ui.lists.close_lists.toggle(self.ui.lists.windows.is(':visible') || self.ui.lists.nicknames.is(':visible'));
            if (self.ui.lists.nicknames.is(':visible')) {
                self.ui.buttons.nicknames.addClass('clicked');
            } else {
                self.ui.buttons.nicknames.removeClass('clicked');
            }
        });

        self.ui.input.focus();
    });
    this.ui.buttons.windows.click(function() {
        self.ui.lists.windows.toggle("slide", { direction: "left" }, 100, function() {
            self.ui.lists.close_lists.toggle(self.ui.lists.windows.is(':visible') || self.ui.lists.nicknames.is(':visible'));
            if (self.ui.lists.windows.is(':visible')) {
                self.ui.buttons.windows.addClass('clicked');
            } else {
                self.ui.buttons.windows.removeClass('clicked');
            }
        });

        self.ui.input.focus();
    });

    this.ui.lists.windows.on('click', 'li', function() {
        var win =
        self.show_window($(this).attr('windowname'));
        self.ui.lists.close_lists.click();
    });
    this.ui.lists.nicknames.on('click', 'li', function() {
        var nick = $(this).attr('windowname');
        self.add_window(nick, 'nickname');
        self.show_window(nick);
        self.ui.lists.close_lists.click();
    });

    this.ui.input.focus(function() { // firefox webapp autoscroll on focus and keyboard popup
       setTimeout(function(){ self.ui.wall.scrollTop(self.ui.wall.prop("scrollHeight")); }, 500);
    });

    this.show_window(this.ui.echoes.attr('windowname'));
};

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
 * echo object:
 *
 * echo = {
 *  type: ['incoming','outgoing','status', 'error'],
 *  echo: "message",
 *  window: "windowname",
 *  avatar: "avatar text",
 *  nick: "nick to add to echo_info",
 *  encrypted: [0,1|true,false]
 *  broadcast: [0,1|true,false], // sends to window specified and to )))
 * }
 *
 *
 * @param   {object} echo Object representing echo
 *
 * @returns {null}
 */
EchoesUi.prototype.echo = function(echo) {
    echo.window = (typeof echo.window == 'string' ? echo.window : $(this.active_window()).attr('windowname'));
    echo.broadcast = (echo.broadcast && echo.window != this.ui.echoes.attr('windowname') ? true : false);
    echo.encrypted = echo.encrypted || false;
    echo.avatar = echo.avatar || '';
    echo.info = echo.info || (echo.nick ? echo.nick + ' @ ' : '') + (new Date()).toLocaleString();
    echo.notify = (echo.notify === false ? false : true);

/*
    <div class='convo'>
    <div class='incoming sms msg unencrypted'>
      <span class='avatar'></span>
      <span class='bubble'>
        <span class='msg-text'>This is a plaintext SMS. Unencrypted conversations are always SMS and have a plain jane, neutral gray backdrop.</span>
        <span class='metadata'>Feb 6</span>
      </span>
    </div>
*/

    var window_object = this.get_window(echo.window);

    var echo_class = '';
    var echo_bubble_class = '';
    var slide_direction = '';
    var echo_extra_avatar_class = '';

    if (window_object.attr('windowtype') == 'nickname') {
        echo_extra_avatar_class = echo.encrypted ? this.assets.encrypt.icon_class.encrypted : this.assets.encrypt.icon_class.unencrypted;
    } else {
        echo_extra_avatar_class = this.assets.echo.icon_class.broadcast;
    }

    switch(echo.type) {
        case 'in':
            echo_class = 'ui_echo_in ui_echo';
            echo_bubble_class = 'ui_echo_bubble';
            slide_direction = 'left';
        break;
        case 'out':
            echo_class = 'ui_echo_out ui_echo';
            echo_bubble_class = 'ui_echo_bubble';
            slide_direction = 'right';
        break;
        case 'error':
            echo_class = 'ui_echo_in ui_echo';
            echo_bubble_class = 'ui_error_bubble';
            echo_extra_avatar_class = 'hidden';
            slide_direction = 'left';
        break;
        default: // case 'status'
            echo_class = 'ui_echo_in ui_echo';
            echo_bubble_class = 'ui_status_bubble';
            echo_extra_avatar_class = 'hidden';
            slide_direction = 'left';
        break;
    }

    var div =
        $('<div>')
            .addClass(echo_class)
            .append(
                $('<span>')
                    .addClass('ui_echo_avatar ' + echo_extra_avatar_class)
                    .text(echo.avatar)
                ,
                $('<span>')
                    .addClass(echo_bubble_class)
                    .append(
                        $('<span>')
                            .addClass('ui_echo_text')
                            .text(echo.echo)
                        ,
                        $('<span>')
                            .addClass('ui_echo_info')
                            .text(echo.info)
                    )
            );

    div.appendTo(window_object);

    if (echo.broadcast) {
        div
            .clone()
            .appendTo(this.get_window(this.ui.echoes.attr('windowname')));
    }

    if (echo.notify == true
        && echo.window != this.active_window().attr('windowname')) {
        this.notification_window_toggle(echo.window, true);
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
EchoesUi.prototype.status = function(status, where, and_echoes, notify) {
    this.echo({
        type: 'status',
        echo: status,
        window: where,
        broadcast: and_echoes,
        notify: notify,
    });
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
        error_out = error.error + (AppConfig.LOG_LEVEL === 0 ? ' (' + error.debug + ')' : '');
    }

    this.echo({
        type: 'error',
        echo: error_out,
        window: where,
        broadcast: and_echoes
    });
};

/**
 * Find the active window element and return it as jquery object
 *
 * @returns {object[]} jQuery object array (hopefully just one...) or []
 */
EchoesUi.prototype.active_window = function() {
    return this.ui.wall.find('div:visible:first');
};

/**
 * Find all the joined channels using windowtype element property
 *
 * @returns {object[]} jQuery object array or []
 */
EchoesUi.prototype.joined_channels = function() {
    return this.ui.wall.find('div[windowtype="channel"]');
};

/**
 * Find all the opened windows
 *
 * @returns {object[]} jQuery object array or []
 */
EchoesUi.prototype.opened_windows = function() {
    return this.ui.wall.find('div');
};

/**
 * Remove a channel element from the channels list using the windowname element property
 *
 * @param   {string} chan Channel to remove
 *
 * @returns {null}
 */
EchoesUi.prototype.remove_channel = function(chan) {
    this.ui.lists.windows.find('li[windowname="' + chan + '"]').remove();
};

/**
 * Remove a nickname element from the nicknames list using the windowname element property
 *
 * @param   {string} nick Nickname to remove
 *
 * @returns {null}
 */
EchoesUi.prototype.remove_nickname = function(nick) {
    this.ui.lists.nicknames.find('li[windowname="' + nick + '"]').remove();
};

/**
 * Empty the channels list
 *
 * @returns {null}
 */
EchoesUi.prototype.clear_channels = function() {
    var self = this;

    this.ui.wall.find('div[windowtype="channel"]').each(function() {
        self.ui.lists.windows.find('li[windowname="' + $(this).attr('windowname') + '"]').remove();
    });
};
/**
 * Empty the nicknames list
 *
 * @returns {null}
 */
EchoesUi.prototype.clear_nicknames = function() {
    this.ui.lists.nicknames.html('');
};

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
          .text(nick);


    this.ui.lists.nicknames.append(nick_element);
};

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

    if (this.ui.wall.find('div[windowname="' + name + '"]').length === 0) {
        this.ui.wall.append(
            $('<div>')
                .attr('windowname', name)
                .attr('windowtype', type)
                .css('display', 'none')
                .append(
                    $('<ul>') // used for window hidden storage, such as nicklist
                        .css('display', 'none')
                )
        );

        if (type == 'nickname') {
            this.error('To start end-to-end encryption, you and ' + name + ' must click the padlock button', name, false);
            this.status('Say hi to ' + name, name);
        }
    }

    if (this.ui.lists.windows.find('li[windowname="' + name + '"]').length === 0) {
        this.ui.lists.windows.append(
            $('<li>')
                .attr('windowname', name)
                .text(name)
        );
    }
};

/**
 * Remove window by windowname property
 *
 * @param   {string} name Window name to remove
 *
 * @returns {null}
 */
EchoesUi.prototype.remove_window = function(name) {
    this.ui.wall.find('div[windowname="' + name + '"]').remove();
};

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
    return this.ui.wall.find('div[windowname="' + name + '"]');
};

/**
 * Sets the encryptionstate property for a window
 *
 * Also sets the encryption icon if on_window is active
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
EchoesUi.prototype.set_window_state = function(state, on_window) {
    switch (state) {
        case 'encrypted':
        case 'oneway':
        break;
        default:
            state = 'unencrypted';
        break;
    }

    this.get_window(on_window).attr('encryptionstate', state);

    if (on_window == this.active_window().attr('windowname')) {
        this.log('setting active window icon to ' + state, 0);
        this.ui.buttons.encrypt.attr('class', this.assets.encrypt.icon_class[state]);
    }
};

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
};

/**
 * Shows a window on the wall and hides all others
 * Also sets the CSS ui selected window property in the nickname/windows list
 * Also calls EchoesUi#scroll_down and focuses the input echo_input
 * Also changes the window_title position based on type of window
 *
 * @see EchoesUi#scroll_down
 *
 * @param   {string} name Window name
 *
 * @returns {null}
 */
EchoesUi.prototype.show_window = function(name) {
    var self = this;

    this.ui.lists.windows.find('li').removeClass('ui_selected_window');
    this.ui.lists.windows.find('li[windowname="' + name + '"]').addClass('ui_selected_window');

    this.ui.wall.find('div:visible:first').hide();
    this.ui.window_title.hide();

    this.ui.wall.find('div[windowname="' + name + '"]').fadeIn('fast', function() {
        if (typeof self.ui.show_window_callback == 'function') {
            self.ui.show_window_callback(name);
        }

        self.ui.window_title.text(name);
        self.ui.window_title.show();

        switch($(this).attr('windowtype')) {
            case 'nickname':
                self.toggle_encrypt_icon(true);
                self.clear_nicknames();
            break;
            case 'channel':
                self.toggle_encrypt_icon(false);
                self.refresh_nicklist(name);
            break;
            default:
                self.toggle_encrypt_icon(false);
                self.clear_nicknames();
            break;
        }

        self.scroll_down();
        self.ui.input.focus();

        self.notification_window_toggle(name, false);

        self.progress(101);
    });
};

EchoesUi.prototype.refresh_nicklist = function(window_name) {
    var self = this;

    if (this.active_window().attr('windowname') == window_name) {
        this.log('refreshing nicklist for: ' + window_name, 0);
        this.clear_nicknames();

        this.get_window(window_name).find('ul:first > li').each(function() {
            self.add_nickname($(this).attr('nickname'));
        });
    }
};

/**
 * Simluate a click on wither a nickname or channel window
 *
 * @param   {string} name Window name to click
 *
 * @returns {null}
 */
EchoesUi.prototype.click_window = function(name) {
    win_object = this.ui.lists.windows.find('li[windowname="' + name + '"]');

    if (win_object.length > 0) {
        win_object.click();
    } else {
        this.error('No such window: ' + name);
    }
};

/**
 * Show or hide the encryption icon near the input.
 * Slides the input cursor according to the encrypt buttons width
 *
 * @param   {bool} on_off On or off
 *
 * @returns {null}
 */
EchoesUi.prototype.toggle_encrypt_icon = function(on_off) {
    var padding = this.ui.buttons.encrypt.outerWidth() + 'px';
    if (on_off) {
        this.ui.buttons.encrypt.show('slide', {direction: 'left'}, 'fast');
        this.ui.input.css('padding-left', padding);
    } else {
        this.ui.input.css('padding-left', '0px');
        this.ui.buttons.encrypt.hide('slide', {direction: 'left'}, 'fast');
    }
};

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
};

/**
 * Close the popup window
 *
 * @returns {null}
 */
EchoesUi.prototype.popup_close = function() {
    this.ui.popup.window.hide();
};

/**
 * Align popup wrapper to center of window
 *
 * @returns {null}
 */
EchoesUi.prototype.popup_center = function() {
    // center div
    this.ui.popup.wrapper.css('margin-top', -this.ui.popup.wrapper.outerHeight()/2 + 'px');
    this.ui.popup.wrapper.css('margin-left', -this.ui.popup.wrapper.outerWidth()/2 + 'px');
};

/**
 * Display progress with the appropriate percent
 *
 * percent value of -1 or 101 will hide the progress bar
 *
 * @param   {int}   percent The progress percent
 *
 * @returns {null}
 */
EchoesUi.prototype.progress = function(percent) {
    if (percent < 0
        || percent > 100) {
        this.ui.progress_bar.fadeOut('fast');
    } else {
        this.ui.progress_bar.fadeIn('fast');
    }
    this.ui.progress_bar.attr('value', percent);
};

/**
 * Toggle the notification bubble for all windows
 *
 * @param   {bool} on_off On or off
 *
 * @returns {null}
 */
EchoesUi.prototype.notification_all_toggle = function(on_off) {
    on_off = on_off || false;

    if (on_off) {
        this.ui.notification.bubble_all.show();
        this.log('notification bubble enabled for all', 0);
    } else {
        this.ui.notification.bubble_all.hide();
        this.log('notification bubble disabled for all', 0);
    }
};

/**
 * Add notification bubble to window tab.
 *
 * If all notifications have been cleared, the all bubble is also cleared
 *
 * @param   {string} window_name Name of window
 * @param   {bool} on_off   On or off
 *
 * @returns {null}
 */
EchoesUi.prototype.notification_window_toggle = function(window_name, on_off) {
    on_off = on_off || false;

    var noti_bubble_class = 'noti_bubble_each';
    var win_object = this.ui.lists.windows.find('li[windowname="' + window_name + '"]');

    if (win_object.length > 0) {
        win_object.find('div[class="' + noti_bubble_class + '"]').remove();

        this.log('notification bubble removed from window: ' + window_name, 0);

        if (on_off) {
            win_object.append(
                $('<div>')
                    .attr('class', noti_bubble_class)
                    .text('!')
            );
            this.log('notification bubble added to window: ' + window_name, 0);
            this.notification_all_toggle(true);
        } else if (this.ui.lists.windows.find('li > div').length == 0) {
            this.notification_all_toggle(false);
        }
    }
};
