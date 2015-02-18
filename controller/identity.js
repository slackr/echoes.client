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
function EchoesIdentity() {
    EchoesObject.call(this, 'id');

    this.ui = null; // ui object ref
    this.crypto = null; // crypto object ref
    this.storage = null; // storage object ref

    this.id = null;
    this.device = null;
    this.session_id = null;
    this.nonce = null;
}
EchoesIdentity.prototype = Object.create(EchoesObject.prototype);
EchoesIdentity.prototype.constructor = EchoesIdentity;

/**
 * (async) Generates a new signing keypair calls register()
 *
 * @param   {object} id   Object containing identity data
 *
 * @returns {null}
 */
EchoesIdentity.prototype.new_identity = function(id) {
    var self = this;

    this.crypto.generate_key('sign', true).then(function() {
        self.crypto.export_key('sign_public').then(function() {
            self.crypto.export_key('sign_private').then(function() {
                id.pubkey = self.crypto.keychain.sign.exported.public_key;
                self.register(id);
            });
        });
    });
}

/**
 * (async) Send a registration request
 *
 * @param   {object} id   Object containing identity data
 *
 * @returns {null}
 */
EchoesIdentity.prototype.register = function(id) {
    var self = this;

    var data = {
        identity: id.identity,
        pubkey: id.pubkey,
        device: id.device,
        email: id.email,
    }

    $.ajax({
        type: "POST",
        url: AppConfig.PARALLAX_AUTH + '/register/',
        data: data,
        dataType: 'json',
    })
    .done(function (data) {
        switch (data.status) {
            case 'success':
                self.save_identity(id);
            break;
            default:
                self.log('reg request error: ' + JSON.stringify(data), 3);
            break;
        }
    })
    .fail(function (err) {
        self.log('reg request http fail: ' + JSON.stringify(err), 3);
    })
    .always(function() {});
}

/**
 * (async) Load identity from storage and import the private key
 *
 * @param   {function}  callback    (optional) Function to callback when loading is complete
 *
 * @returns {null}
 */
EchoesIdentity.prototype.load_identity = function(callback, callback_noid) {
    var self = this;

    this.storage.get('identity', function(data) {
        if (typeof data.identity == 'undefined'
            || data.identity == null) {
            self.log("no identity found in storage", 2);
            if (typeof callback_noid == 'function') {
                callback_noid();
            }
            return;
        }

        var identity_data = JSON.parse(data.identity);
        self.crypto.import_key('sign', identity_data.privkey, 'pkcs8', true)
            .then(function() {
                self.id = identity_data.identity;
                self.device = identity_data.device;
                self.log("identity '" + self.id + "' loaded from storage", 1);
                if (typeof callback == 'function') {
                    callback(identity_data);
                }
            })
            .catch(function(e) {
                console.log(e);
                self.id = null;
                self.device = null;
                self.log("failed to load identity '" + identity_data.identity + "' from storage: " + e, 3);
            });
    });
}

/**
 * (async) Save identity to storage after successful registration
 *
 * @param   {object} id   Object containing identity data
 *
 * @returns {null}
 */
EchoesIdentity.prototype.save_identity = function(id) {
    var self = this;

    id.privkey = this.crypto.keychain.sign.exported.private_key; // this should be wrapped with aes
    this.storage.set('identity', JSON.stringify(id), function() {
        self.log("identity '" + id.identity + "' saved to storage", 1);
        self.load_identity();
    });
}

/**
 * (async) Initiate an authentication request for currently
 * loaded identity and device
 *
 * @see EchoesIdentity#load_identity
 *
 * @param   {function}  callback    (optional) Passed to auth_reply
 *
 * @returns {null}
 */
EchoesIdentity.prototype.auth_request = function(callback) {
    var self = this;

    var data = {
        identity: this.id,
        device: this.device,
    }

    $.ajax({
        type: "POST",
        url: AppConfig.PARALLAX_AUTH + '/auth-request/',
        data: data,
        dataType: 'json',
    })
    .done(function (data) {
        switch (data.status) {
            case 'success':
                var nonce = data.nonce;

                self.log('auth request incoming: ' + JSON.stringify(data), 0);
                self.crypto.sign(nonce, self.crypto.keychain.sign.imported.private_key)
                    .then(function() {
                        var nonce_signature = btoa(self.crypto.resulting_signature);
                        self.auth_reply(nonce, nonce_signature, callback);
                    })
                    .catch(function(e) {
                        self.log('failed to sign nonce from auth-reply: ' + data.nonce + ', e: ' + e);
                    });
            break;
            default:
                self.log('auth request error: ' + JSON.stringify(data), 3);
            break;
        }
    })
    .fail(function (err) {
        self.log('auth request http fail: ' + JSON.stringify(err), 3);
    })
    .always(function() {});
}

/**
 * (async) Reply to auth request with signed nonce
 *
 * First parameter of callback will be the session_id returned from parallax
 *
 * @see EchoesIdentity#auth_request
 *
 * @param   {function}  callback    (optional) Function to callback when auth-reply succeeds
 *
 * @returns {null}
 */
EchoesIdentity.prototype.auth_reply = function(nonce, nonce_signature, callback) {
    var self = this;

    var data = {
        nonce_identity: this.id,
        nonce: nonce,
        nonce_signature: nonce_signature,
        device: this.device,
    }

    $.ajax({
        type: "POST",
        url: AppConfig.PARALLAX_AUTH + '/auth-reply/',
        data: data,
        dataType: 'json',
    })
    .done(function (data) {
        switch (data.status) {
            case 'success':
                self.log('auth success: ' + JSON.stringify(data), 0);
                self.session_id = data.session_id;

                if (typeof callback == 'function') {
                    callback(self.session_id);
                }
            break;
            default:
                self.log('auth reply error: ' + JSON.stringify(data), 3);
            break;
        }
    })
    .fail(function (err) {
        self.log('auth reply http fail: ' + JSON.stringify(err), 3);
    })
    .always(function() {});
}