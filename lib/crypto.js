/**
 * from https://chromium.googlesource.com/chromium/blink/+/master/LayoutTests/crypto/subtle
 * and http://kjur.github.io/jsjws/tool_b64udec.html
 */

function EchoesCrypto() {
    EchoesObject.call(this, 'crypto');

    this.keygen_encrypt_algo = {
        name: 'RSA-OAEP',
        hash: {name: 'sha-256'},
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),  // Equivalent to 65537
    };
    this.keygen_sign_algo = {
        name: "ECDSA",
        namedCurve: "P-256"
    };
    this.keychain = {
        sign : {
            public_key: null,
            private_key: null,
            imported: {
                public_key: null,
                private_key: null,
            }
        },
        encrypt: {
            public_key: null,
            private_key: null,
            imported: {
                public_key: null,
                private_key: null,
            }
        }
    };
    this.jwk_exported_key = null;
    this.encrypted_data = null;
}

EchoesCrypto.prototype = Object.create(EchoesObject.prototype);
EchoesCrypto.prototype.constructor = EchoesCrypto;

EchoesCrypto.prototype.generate_keypair = function(key_type, extractable) {
    extractable = extractable || false;

    var keychain = null;
    var key_usage = null;
    var self = this;

    switch (key_type) {
        case 'encrypt':
            key_usage = ['encrypt', 'decrypt'];
            keygen_algo = this.keygen_encrypt_algo;
            keychain = this.keychain.encrypt;
        break;
        case 'sign':
            key_usage = ['sign', 'verify'];
            keygen_algo = this.keygen_sign_algo;
            keychain = this.keychain.sign;
        break;
    }

    this.log('generating ' + key_type + ' key: '+ JSON.stringify(keygen_algo) + ' / ' + JSON.stringify(key_usage));

    return crypto.subtle.generateKey(keygen_algo, extractable, key_usage)
        .then(function(k) {
            keychain.public_key = k.publicKey;
            keychain.private_key = k.privateKey;
            self.log('keygen successful for ' + key_type, 0);
        })
        .catch(function(e) {
            self.log('keygen error: ' + e.toString());
            self.log(e);
        });
}
EchoesCrypto.prototype.export_public_key = function(key_type) {
    var self = this;
    var key = null;

    switch (key_type) {
        case 'encrypt':
            key = this.keychain.encrypt.public_key;
        break;
        case 'sign':
            key = this.keychain.sign.public_key;
        break;
    }

    return crypto.subtle.exportKey('jwk', key)
        .then(function(k) {
            self.jwk_exported_key = k;
            self.log('jwk key exported to self.jwk_exported_key', 0);
        })
        .catch(function(e){
            self.log('export error: ' + e.toString(), 3);
            self.log(e, 3);
        });
}

EchoesCrypto.prototype.import_jwk_key = function(key_type, jwk_key) {
    var keychain_imported = null;
    var keygen_algo = null;
    var self = this;

    switch (key_type) {
        case 'encrypt':
            keygen_algo = {
                name: this.keygen_encrypt_algo.name,
                hash: this.keygen_encrypt_algo.hash,
            };
            keychain_imported = this.keychain.encrypt.imported;
        break;
        case 'sign':
            keygen_algo = this.keygen_sign_algo;
            keychain_imported = this.keychain.sign.imported;
        break;
    }

    return crypto.subtle.importKey('jwk', jwk_key, keygen_algo, jwk_key.ext, jwk_key.key_ops)
        .then(function(k) {
            switch(k.type) {
                case 'public':
                    keychain_imported.public_key = k;
                break;
                case 'private':
                    keychain_imported.private_key = k;
                break;
            }
            self.log('jwk key imported to self.keychain.encrypt.imported', 0);
        })
        .catch(function(e){
            self.log('import error: ' + e.toString(), 3);
            self.log(e, 3);
        });
}

EchoesCrypto.prototype.encrypt = function(data, public_key) {
    var self = this;

    return crypto.subtle.encrypt(this.keygen_encrypt_algo, public_key, this.string_to_ui8a(data))
        .then(function(k) {
            self.encrypted_data = self.bytes_to_string(k);
            self.log('encrypted data saved to self.encrypted_data', 0);
        })
        .catch(function(e){
            self.log('encrypt error: ' + e.toString(), 3);
            self.log(e, 3);
        });
}

EchoesCrypto.prototype.decrypt = function(data, private_key) {
    var self = this;

    return crypto.subtle.decrypt(this.keygen_encrypt_algo, private_key, this.string_to_ui8a(data))
        .then(function(k) {
            self.decrypted_data = self.bytes_to_string(k);
            self.log('decrypted data saved to self.decrypted_data', 0);
        })
        .catch(function(e){
            self.log('decrypt error: ' + e.toString(), 3);
            self.log(e, 3);
        });
}

EchoesCrypto.prototype.bytes_to_string = function(buffer) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer));
}

EchoesCrypto.prototype.string_to_ui8a = function(string) {
    var chars = [];
    for (var i = 0; i < string.length; ++i) {
        chars.push(string.charCodeAt(i));
    }
    return new Uint8Array(chars);
}

EchoesCrypto.prototype.base64_to_ui8a = function(string) {
    string = string.replace(/(\r\n|\n|\r)/gm, '');
    return new Uint8Array(Array.prototype.map.call(atob(string), function (c) { return c.charCodeAt(0) }));
}

EchoesCrypto.prototype.base64u_to_base64 = function(s) {
    /**
     * credit: http://kjur.github.io/jsjws/tool_b64udec.html
     */
    if (s.length % 4 == 2) {
        s = s + "==";
    } else if (s.length % 4 == 3) {
        s = s + "=";
    }
    s = s.replace(/-/g, "+");
    s = s.replace(/_/g, "/");
    return s;
}
