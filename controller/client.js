/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * Client controller that handles command execution and whatnot
 *
 * @class
 * @extends EchoesObject
 */
function EchoesClient() {
    EchoesObject.call(this, 'client');

    this.socket = null; // socket.io object ref
    this.ui = null; // ui object ref
    this.crypto = null; // crypto object ref
    this.id = null; // crypto object ref

    /**
     * @type Object A hash of nicknames and their imported keys/symkeys and keysent status
     */
    this.nickchain = {};

}
EchoesClient.prototype = Object.create(EchoesObject.prototype);
EchoesClient.prototype.constructor = EchoesClient;

/**
 * Process and execute a client command
 *
 * First array element will be the command, the rest are the commands parameters
 *
 * Example: ['/keyx','nick'] - ['/who'] - ['/eecho','nick','echo']
 *
 * If not handled locally, pass to server
 *
 * @param   {Array} params  An array of parameters to process
 *
 * @returns {null}
 */
EchoesClient.prototype.execute_command = function(params) {
    var self = this;
    var command = params[0];
    params.shift();

    switch (command) {
        case '/clear_storage':
        case '/storage_clear':
            this.ui.popup('Storage', 'Are you sure you want to clear the app storage? Identity will be lost...', 'CANCEL', 'CLEAR STORAGE', null, function() {
                console.log('clear!');
                self.id.storage.clear();
                self.ui.popup('Storage', 'The storage was cleared.', 'NEW NICKNAME', function() {
                    self.register_show();
                });
            });
        break;
        case '/config':
            switch(params[0]) {
                case 'LOG_LEVEL':
                    var val = parseInt(params[1]);
                    if (isNaN(val)) {
                        val = AppConfig.LOG_LEVEL;
                    }
                    AppConfig.LOG_LEVEL = val;
                    this.ui.status('AppConfig.LOG_LEVEL = ' + val);
                    this.log('AppConfig.LOG_LEVEL = ' + val, 0);
                break;
                default:
                    this.ui.error('Invalid AppConfig variable');
                    this.log('Invalid AppConfig variable ' + params[0], 3);
                break;
            }
        break;
        case '/clear':
            this.ui.ui.echoes.html('');
        break;
        case '/pm':
        case '/msg':
        case '/private':
        case '/win':
        case '/window':
        case '/query':
            var nick = params[0];
            this.socket.sio.emit('/pm', nick);
        break;
        case '/echo':
            var chan = params[0];
            var echo = params[1];

            this.ui.echo(this.id.identity + ' ))) ' + echo);
            this.socket.sio.emit('/echo', { echo: echo, to: chan });
        break;
        case '/eecho':
            var nick = params[0];
            var plaintext = params[1];

            this.send_encrypted_echo(nick, plaintext);
        break;
        case '/keyx':
            this.keyx_send_key(params[0]);
        break;
        case '/keyx_off':
            this.keyx_off(params[0], true);
        break;
        default:
            this.socket.sio.emit(command, params);
            this.log('passed unhandled command to server: ' + command + ' ' + params.join(' '), 0);
        break
    }
}

/**
 * Fetch the echo from input and parse.
 *
 * Determines if the first word is a command, if so pass to
 * this.execute_command() for further processing
 *
 * Determines if window state is 'encrypted' and automtically encrypts normal echoes
 *
 * @returns {null}
 */
EchoesClient.prototype.send_echo = function() {
    var echo = this.ui.ui.input.val();
    var split = echo.trim().split(' ');
    var to = this.ui.active_window().attr('windowname');

    if (echo == '') {
        this.ui.ui.input.focus();
        return;
    }

    if (split[0][0] == '/') {
        this.execute_command(split);
    } else {
        if (this.ui.active_window().attr('encryptionstate') == 'encrypted') {
            this.execute_command(['/eecho', to, echo]);
        } else {
            this.execute_command(['/echo', to, echo]);
        }
    }

    this.ui.ui.input.val('');
    this.ui.ui.input.focus();
}

/**
 * Looks for channel windows and autojoins
 *
 * @returns {null}
 */
EchoesClient.prototype.join_channels = function() {
    var self = this;

    this.log('Auto-joining previously joined channels...', 0);
    this.ui.joined_channels().each(function() {
        self.execute_command(['/join', $(this).attr('windowname')]);
    });
}

/**
 * (async) Derive a symmetric key using two CryptoKey objects
 *
 * If either public/private key parameters are null, derivation is aborted
 *
 * @param   {string} nick           Which nick's keystore to use
 * @param   {CryptoKey} private_key Object representing a private key
 * @param   {CryptoKey} public_key  Object representing a public key
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesClient.prototype.keyx_derive_key = function(nick, private_key, public_key) {
    if (! private_key
        || ! public_key) {
        this.ui.log('keyx symkey derivation failed, pub: ' + public_key + ', priv: ' + private_key, 3);
        return Promise.reject('Invalid public or private key');
    }
    var self = this;
    var c = new EchoesCrypto();

    return c.derive_key(private_key, public_key).then(function() {
        self.set_nickchain_property(nick, {
            symkey: c.derived_key,
        });

        self.update_encrypt_state(nick);

        self.ui.status('Successfully derived encryption key for ' + nick);
        self.log('symkey derived for: ' + nick, 0);
    }).catch(function(e){
        self.wipe_nickchain(nick);
        self.update_encrypt_state(nick);

        self.ui.error({ error: 'Failed to derive encryption key for ' + nick, debug: e.toString() });
        self.log('derive: ' + e.toString(), 3);
    });
}

/**
 * (async) Decrypts encrypted symkey from nick using private key
 *
 * @param   {string} nick                           Nickchain to use
 * @param   {Array} encrypted_symkey_segments       Array of encrypted segments to pass to decrypt_asym
 * @param   {CryptoKey} private_key                 CrytpoKey object to use for decryption
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesClient.prototype.keyx_decrypt_symkey = function(nick, encrypted_symkey_segments, private_key) {
    if (! private_key) {
        this.ui.log('decrypt symkey failed, priv: ' + private_key, 3);
        return Promise.rejected('Invalid private key');
    }
    var self = this;
    var c = new EchoesCrypto();
    var kc = 'sym';

    return c.decrypt_asym(encrypted_symkey_segments, private_key).then(function() {
        self.log('symkey decrypt successful from: ' + nick, 0);

        return c.import_key(kc, c.decrypted_text, 'raw', false).then(function() {
            self.set_nickchain_property(nick, {
                symkey: c.keychain[kc].imported.key
            });

            self.ui.status('Successfully retrieved symkey from ' + nick);
            self.log('symkey decrypted from: ' + nick + ' (' + self.get_nickchain_property(nick, 'symkey') + ')', 0);
        }).catch(function(e) {
            self.ui.error({ error: 'Failed to import symkey from ' + nick, debug: kc + ': ' + e.toString() });
            self.log('decrypt symkey: ' + e.toString(), 3);
        });
    }).catch(function(e) {
        self.ui.error({ error: 'Failed to decrypt symkey from ' + nick, debug: kc + ': ' + e.toString() });
        self.log('decrypt symkey: ' + e.toString(), 3);
    });
}

/**
 * (async) Decrypt incoming eecho
 *
 * @param   {string} nick   Nickname that sent the echo
 * @param   {Array} echo    Array of encrypted segments
 *
 * @returns {null}
 */
EchoesClient.prototype.decrypt_encrypted_echo = function(nick, echo) { // echo is an array of b64 encoded segments
    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    var kc = this.get_nickchain_property(nick, 'keychain');
    if (kc == null
        || this.get_nickchain_property(nick, 'symkey') == null) {
        this.ui.error("Unable to decrypt echo from " + nick + ". No decryption key available. Initiate a key exchange.");
        return;
    }
    if (typeof echo != 'object'
        || echo.length == 0) {
        this.ui.log('invalid encrypted echo from ' + nick + ': ' + typeof echo, 3);
        this.ui.error("Could not decrypt echo from " + nick + ". It appears invalid.");
        return;
    }

    var self = this;
    var c = new EchoesCrypto();

    this.ui.add_nickname(nick);
    c.decrypt(echo, this.crypto.keychain[kc].private_key, this.get_nickchain_property(nick, 'symkey')).then(function() {
        self.ui.echo(nick + ' ))) [encrypted] ' + c.decrypted_text, nick, false);
    }).catch(function(e) {
        self.ui.error({ error: 'Decrypt operation failed on echo from ' + nick, debug: kc + ': ' + e.toString() });
    });
}

/**
 * (async) Encrypt and send echo to a nickname
 *
 * '/echo' is emitted to server bypassing execute_command
 * emit data = { type: 'encrypted', to: 'nick', echo: 'array of segments' }
 *
 * @param   {string} nick   Nickname to send eecho to
 * @param   {string} echo   Text to encrypt and send
 *
 * @returns {null}
 */
EchoesClient.prototype.send_encrypted_echo = function(nick, echo) {
    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    if (this.get_nickchain_property(nick, 'symkey') ==  null) {
        this.ui.error("You do not have an encryption key for " + nick + ". Initiate a key exchange first.");
        this.log('no encryption key found in nickchain: ' + nick, 3);
        return;
    }

    var self = this;
    var c = new EchoesCrypto();

    c.encrypt(echo, this.get_nickchain_property(nick, 'public_key'), this.get_nickchain_property(nick, 'symkey')).then(function() {
        var and_echoes = false;

        self.socket.sio.emit('/echo', { // bypass execute_command for encrypted echoes, we'll write it on the wall manually below
            type: 'encrypted',
            to: nick,
            echo: c.encrypted_segments, // an array of base64 encoded segments
        });

        if (self.ui.get_window(nick).length == 0) {
            and_echoes = true;
        }
        self.ui.echo(self.id.identity + ' ))) [encrypted] ' + echo, nick, and_echoes);
    }).catch(function(e) {
        self.ui.error({ error: 'Encrypt operation failed on echo to ' + nick, debug: e.toString() });
    });
}

/**
 * Turn off encryption for an endpoint
 *
 * Will wipe nickchain and inform endpoint encryption has been turned off if second param is true
 *
 * !keyx_off is emitted to server IF second param is true, using { to: 'nick' }
 *
 * @param   {string} function       Endpoint to turn off encryption/keyx on
 * @param   {bool} inform_endpoint  (default='false') Send a keyx_off message to server to inform endpoint?
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_off = function(endpoint, inform_endpoint) {
    inform_endpoint = inform_endpoint || false;

    this.wipe_nickchain(endpoint);
    this.update_encrypt_state(endpoint);

    if (inform_endpoint) {
        this.socket.sio.emit('!keyx_off', {
            to: endpoint
        });
    }
}

/**
 * (async) Import keyx data from server
 *
 * Marked as async because key derivation for keyx is asynchronous (i should fix this)
 * Right now this function assumes it's public and will use 'spki' as the type
 *
 * data = { from: 'nick', keychain: 'keyx|asym', pubkey: 'base64 encoded PEM pubkey' }
 *
 * @param   {object} data Object of keyx data to process
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_import = function(data) {
    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    var self = this;
    var nick = data.from;
    var kc = data.keychain;
    var encrypted_symkey_segments = data.symkey;
    var key = atob(data.pubkey);
    var c = new EchoesCrypto();

    c.import_key(kc, key, 'spki').then(function() {
        return c.hash(key).then(function() {
            var nick_pubkey = c.keychain[kc].imported.public_key;

            self.set_nickchain_property(nick, {
                public_key: nick_pubkey,
                hash: c.resulting_hash.match(/.{1,8}/g).join(' '),
                keychain: kc,
            });

            self.ui.status('Imported public key from ' + nick + ' (' + self.get_nickchain_property(nick, 'hash') + ')');
            self.log(kc + ' pubkey import successful from: ' + nick + ' (' + self.get_nickchain_property(nick, 'hash') + ')', 0);

            if (kc == 'keyx') {
                if (self.crypto.keychain[kc].private_key) {
                    return self.keyx_derive_key(nick, self.crypto.keychain[kc].private_key, nick_pubkey).then(function(){
                        self.log('key derivation successful after import', 0);
                    }).catch(function(e){
                        self.log('key derivation failed after import: ' + e.toString(), 3);
                    });
                } else {
                    self.log('key derivation skipped, no private key in keychain: ' + kc, 0);
                    return Promise.resolve();
                }
            }

            // if a symkey is sent with pubkey, attempt to decrypt it, otherwise generate a new symkey to be sent back
            if (encrypted_symkey_segments) {
                return self.keyx_decrypt_symkey(nick, encrypted_symkey_segments, self.crypto.keychain[kc].private_key).then(function(){
                    self.log('symkey decryption successful after import', 0);
                }).catch(function(e){
                    self.log('symkey decryption failed after import: ' + e.toString(), 3);
                });
            } else {
                self.log(kc + ' no symkey supplied by: ' + nick + ', generating a new one...', 0);
                return c.generate_key('sym', true).then(function(){
                    self.set_nickchain_property(nick, { symkey: c.keychain['sym'].key });
                    return c.export_key('sym').then(function(){
                        return c.encrypt_asym(c.keychain['sym'].exported.key, nick_pubkey).then(function(){
                            self.set_nickchain_property(nick, { encrypted_symkey: c.encrypted_segments });
                            self.ui.status('Sucessfully generated symkey for ' + nick);
                        }).catch(function(e){
                            self.ui.error('Failed to encrypt symkey for ' + nick + ': ' + e.toString());
                            self.log('encrypt_asym for symkey to ' + nick + ' failed: ' + e.toString(), 3);
                        });
                    }).catch(function(e){
                        self.ui.error('Failed to export symkey for ' + nick + ': ' + e.toString());
                        self.log('export_key for symkey to ' + nick + ' failed: ' + e.toString(), 3);
                    });
                }).catch(function(e){
                    self.ui.error('Failed to generate symkey for ' + nick + ': ' + e.toString());
                    self.log('generate_key for symkey to ' + nick + ' failed: ' + e.toString(), 3);
                });
            }
        }).catch(function(e) {
            self.wipe_nickchain(nick);
            self.update_encrypt_state(nick);

            self.ui.error({ error: 'Failed hash public key from ' + nick, debug: kc + ': ' + e.toString() });
            self.log('hash: ' + e.toString(), 3);
        })
    }).catch(function(e) {
        self.wipe_nickchain(nick);
        self.update_encrypt_state(nick);

        self.ui.error({ error: 'Failed to import public key from ' + nick, debug: kc + ': ' +  e.toString() });
        self.log('import key: ' + e.toString(), 3);
    });
}

/**
 * (async) Generate a new keypair before key exchange
 *
 * If 'endpoint' is not null/undefined, the exported pubkey will be sent
 * If kc is not specified 'asym' is used
 *
 * @param   {string} endpoint (optional) Who to send key to
 * @param   {string} kc       (default='asym') Which keychain to use
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_new_key = function(endpoint, kc) {
    kc = kc || 'asym';

    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    this.ui.status('Generating new session keys (' + kc + ')...');
    this.log('generating new ' + kc + ' session keypair...', 0);

    var self = this;
    this.crypto.generate_key(kc).then(function() {
        self.log(kc + ' keypair generated, exporting...', 0);
        return self.crypto.export_key(kc + '_public').then(function() {
            self.log(kc + ' public key exported successfully', 0);

            return self.crypto.hash(self.crypto.keychain[kc].exported.public_key).then(function() {
                self.crypto.keychain[kc].exported.hash = self.crypto.resulting_hash.match(/.{1,8}/g).join(' ');
                self.ui.status('Successfully generated new session key (' + kc + '): ' + self.crypto.keychain[kc].exported.hash);
                if (typeof endpoint != 'undefined'
                    && endpoint != null) {
                    self.log('sending ' + kc + ' public key to endpoint: ' + endpoint, 0);
                    self.keyx_send_key(endpoint);
                }
            }).catch(function(e) {
                self.ui.error('Failed to hash exported ' + kc + ' key: ' + e.toString());
            });
        }).catch(function(e) {
            self.ui.error('Failed to export key: ' + e.toString());
        });
    }).catch(function(e) {
        self.ui.error('Failed to generate keypair: ' + e.toString());
    });
}

/**
 * Send an exported public key to an endpoint
 *
 * If the client doesn't currently have a public key for the specified keychain, keyx_new_key is called first
 *
 * If browser supports elliptic curve, the 'keyx' keychain is used, else use 'asym'
 * If the endpoint already specified a supported keychain, use that instead
 *
 * !keyx is emitted to socket using { to: 'nick', pubkey: 'base64 encoded PEM formatted pubkey', keychain: 'keyx|asym' }
 *
 * @see EchoesClient#keyx_new_key
 * @see EchoesCrypto#browser_support
 *
 * @param   {string} endpoint Endpoint to send key to
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_send_key = function(endpoint) {
    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    var self = this;
    var kc = this.get_nickchain_property(endpoint, 'keychain') || (this.crypto.browser_support.ec.supported ? 'keyx' : 'asym');

    if (this.crypto.keychain[kc].public_key == null) {
        this.keyx_new_key(endpoint, kc);
        return;
    }

    this.set_nickchain_property(endpoint, { keychain: kc });

    this.log('found existing ' + kc + ' keypair, broadcasting...', 0);

    var broadcast = {
        to: endpoint,
        pubkey: btoa(this.crypto.keychain[kc].exported.public_key),
        keychain: kc,
        symkey: this.get_nickchain_property(endpoint, 'encrypted_symkey'), // generated after import of pubkey in keyx_import()
    }

    this.socket.sio.emit('!keyx', broadcast);
}

/**
 * Determines the encryption state for a window and sets the window state accordingly
 *
 * Changes the icon to the matching encryption state asset
 *
 * @see EchoesUi#set_window_state
 *
 * @param   {string} for_window Window name
 *
 * @returns {null}
 */
EchoesClient.prototype.update_encrypt_state = function(for_window) {
    var sent_decrypt_key = (this.get_nickchain_property(for_window, 'keysent') == true ? true : false);
    var received_encrypt_key = (this.get_nickchain_property(for_window, 'public_key') != null ? true : false);

    var state = 'unencrypted';
    if (received_encrypt_key && sent_decrypt_key) {
        state = 'encrypted';
    } else if (received_encrypt_key && ! sent_decrypt_key) {
        state = 'oneway';
    }

    this.ui.set_window_state(state, for_window);

    if (for_window == this.ui.active_window().attr('windowname')) {
        this.log('setting active window icon to ' + state, 0);
        for (var icon in this.ui.assets.encrypt) {
            this.ui.assets.encrypt[icon].hide();
        }
        this.ui.assets.encrypt[state].show();
    }

    this.log('window ' + for_window + ' set to ' + state + ' sent?:' + sent_decrypt_key + ' recv?:' + received_encrypt_key, 0);
}

/**
 * Sets a this.nickchain property for a nick and initializes if chain is not defined yet
 *
 * Also updates the encryption state for windowname='nick'
 *
 * props = { public_key: '', symkey: '', keysent: true, ... }
 *
 * @see EchoesClient#pt_state
 *
 * @param   {string} nick     Nickname to set property on
 * @param   {object} props    Set of properties to apply to nickchain for nick
 *
 * @returns {null}
 */
EchoesClient.prototype.set_nickchain_property = function(nick, props) {
    if (typeof this.nickchain[nick] == 'undefined') {
        this.init_nickchain(nick);
    }

    for (var key in props) {
        this.nickchain[nick][key] = props[key];
    }

    this.update_encrypt_state(nick);
    this.log('set prop ' + JSON.stringify(props) + ' on nickchain: ' + nick, 0);
}

/**
 * Get a property value from a nick's this.nickchain
 *
 * Default prop = 'public_key'
 *
 * @param   {string} nick     Nickname to get property from
 * @param   {string} prop     (default='public_key') Property to retrieve
 *
 * @returns {null|string} Return property value or null
 */
EchoesClient.prototype.get_nickchain_property = function(nick, prop) {
    prop = prop || 'public_key';

    if (typeof this.nickchain[nick] == 'undefined') {
        this.init_nickchain(nick);
        return null;
    }

    if (typeof this.nickchain[nick][prop] == 'undefined') {
        return null;
    }

    this.log('get prop ' + prop + ' from keychain: ' + nick + ' (' + JSON.stringify(this.nickchain[nick][prop]) + ')', 0);
    return this.nickchain[nick][prop];
}

/**
 * Initialize nickchain for nickname
 *
 * @param   {string} nick Nickname
 *
 * @returns {null}
 */
EchoesClient.prototype.init_nickchain = function(nick) {
    this.nickchain[nick] = {};
    this.log('initialized nickchain for ' + nick, 0);
}

/**
 * Wipe without initializing nickchain for nickname
 *
 * @param   {string} nick Nickname
 *
 * @returns {null}
 */
EchoesClient.prototype.wipe_nickchain = function(nick) {
    delete this.nickchain[nick];
    this.log('wiped nickchain for ' + nick, 0);
}

/**
 * Wipe all keychains
 *
 * @returns {null}
 */
EchoesClient.prototype.wipe_all_nickchains = function() {
    this.nickchain = {};
    this.log('wiped all nickchains', 0);
}

/**
 * Display the registration window
 *
 * @returns {null}
 */
EchoesClient.prototype.register_show = function() {
    var self = this;
    this.ui.ui.popup.message.html('');

    var fields = {
        'Nickname': {
            input_id: 'register_input_nickname',
            focus: true,
        },
        'Your@email.com': {
            input_id: 'register_input_email'
        },
    }


    this.ui.ui.popup.message.append(
        $('<div>')
            .addClass('registration_message')
            .attr('id', 'registration_message')
            .text('')
    );

    for (var field in fields) {
        this.ui.ui.popup.message.append(
            $('<input>')
                .addClass('register_field_input')
                .attr('id', fields[field].input_id)
                .attr('placeholder', field)
        );
        if (fields[field].focus) {
            $(fields[field].input_id).focus();
        }
    }

    this.ui.popup('New Nickname', '', 'REGISTER', 'CANCEL',
        (function(self) {
            return function() {
                self.register_submit(self);
            }
        })(self)
    );

    this.ui.ui.popup.message.find('input:first').focus();
}

EchoesClient.prototype.register_submit = function(self) {
    var register_data = {
        identity: self.ui.ui.popup.message.find('#register_input_nickname').val(),
        email: self.ui.ui.popup.message.find('#register_input_email').val(),
        device: self.crypto.bytes_to_hex(self.crypto.new_iv(32)),
    }
    var registration_message = $('#registration_message');

    self.log('starting registration for ' + JSON.stringify(register_data), 0);
    return self.id.generate_signing_keypair().then(function(){
        self.id.identity = register_data.identity;
        self.id.device = register_data.device;
        self.id.email = register_data.email;
        self.id.register().then(function(){
            self.log('registration successful for ' + JSON.stringify(register_data), 0);
            registration_message.text('Successfully registered nickname: ' + self.id.identity);
            self.ui.popup_center();
            self.id.save_identity().then(function(){
                self.connect();
            }).catch(function(e){
                registration_message.text(e);
                self.ui.popup_center();
            });
        }).catch(function(e){
            registration_message.text(e);
            self.ui.popup_center();
            self.log(e, 3);
        });
    }).catch(function(e){
        self.log('failed to generate signing keypair for ' + JSON.stringify(register_data), 3);
        registration_message.text(e);
        self.ui.popup_center();
    });
}

EchoesClient.prototype.connect = function() {
    var self = this;
    this.id.auth_request().then(function(){
        self.id.auth_reply().then(function(){
            self.ui.popup('Ready to connect','Hello ' + self.id.identity + '!', 'CONNECT', null, function() {
                self.ui.status('Connecting...');

                self.socket.initialize();
                self.ui.popup_close();
            });
        }).catch(function(e){
            self.ui.popup('Error','Failed to authenticate nickname: ' + self.id.identity + ' (' + e + ')', 'RETRY', 'NEW NICKNAME', function() {
                self.connect();
                self.ui.popup_close();
            }, function() {
                self.register_show();
            });
        })
    }).catch(function(e){
        self.ui.popup('Error','Failed to authenticate nickname: ' + self.id.identity + ' (' + e + ')', 'RETRY', 'NEW NICKNAME', function() {
            self.connect();
            self.ui.popup_close();
        }, function() {
            self.register_show();
        });
    });
}

EchoesClient.prototype.is_connected = function() {
    if (typeof this.socket == 'undefined'
        || typeof this.socket.sio == 'undefined'
        || ! this.socket.sio
        || ! this.socket.sio.connected) {
        return false;
    }
    return true;
}
