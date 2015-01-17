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
    this.digest_algo = {
        name: "SHA-256",
    }

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
    this.jwk_exported_key_hash = null;
    this.encrypted_segments = [];
    this.decrypted_segments = [];
    this.decrypted_text = null;
    this.resulting_hash = null;
}

EchoesCrypto.prototype = Object.create(EchoesObject.prototype);
EchoesCrypto.prototype.constructor = EchoesCrypto;

EchoesCrypto.prototype.generate_keypair = function(key_type, extractable) {
    extractable = extractable || false;

    var keychain = null;
    var keygen_algo = null;
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

    this.log('generating ' + key_type + ' key: '+ JSON.stringify(keygen_algo) + ' / ' + JSON.stringify(key_usage), 1);

    return crypto.subtle.generateKey(keygen_algo, extractable, key_usage)
        .then(function(k) {
            keychain.public_key = k.publicKey;
            keychain.private_key = k.privateKey;
            self.log('keygen successful for ' + key_type, 0);
            return Promise.resolve();
        })
        .catch(function(e) {
            self.log('keygen error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
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
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('export error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
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
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('import error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.hash = function(data) {
    if (typeof data != 'string') {
        data = JSON.stringify(data);
    }
    var self = this;

    return crypto.subtle.digest(this.digest_algo, this.string_to_ab(data))
        .then(function(h) {
            self.resulting_hash = self.bytes_to_hex(h);
            self.log('resulting hash saved to self.resulting_hash (' + data + ' -> ' + self.resulting_hash + ')', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('hash error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.encrypt = function(data, public_key, leftovers) {
    var self = this;

    if (data != null) {
        this.log('splitting b64 encoded data into segments...', 0);
        this.encrypted_segments = [];
        leftovers = this.b64_encode(data).match(/.{1,64}/g);
    }

    return crypto.subtle.encrypt(this.keygen_encrypt_algo, public_key, this.string_to_ab(leftovers[0]))
        .then(function(k) {
            leftovers.shift();

            self.encrypted_segments.push(btoa(self.ab_to_string(k))); // btoa again
            self.log('encrypted data pushed to self.encrypted_segments, segments left to encrypt: ' + leftovers.length, 0);

            return (leftovers.length > 0 ? self.encrypt(null, public_key, leftovers) : Promise.resolve());
        })
        .catch(function(e){
            self.log('encrypt error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.decrypt = function(data_segments, private_key) {
    var self = this;

    data_segments[0] = atob(data_segments[0]); // b64 decode chunk before decryption

    return crypto.subtle.decrypt(this.keygen_encrypt_algo, private_key, this.string_to_ab(data_segments[0]))
        .then(function(k) {
            data_segments.shift();

            self.decrypted_segments.push(self.ab_to_string(k));
            self.log('decrypted data pushed to self.decrypted_data, segments left to decrypt: ' + data_segments.length, 0);

            if (data_segments.length == 0) {
                self.decrypted_text = self.b64_decode(self.decrypted_segments.join(''));
            }
            return (data_segments.length > 0 ? self.decrypt(data_segments, private_key) : Promise.resolve());
        })
        .catch(function(e){
            self.log('decrypt error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.b64_decode = function(str) { // mdn hack to b64 encode unicode for now.. escape/unescape is deprecated
    return decodeURIComponent(escape(atob(str)));
}
EchoesCrypto.prototype.b64_encode = function(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

EchoesCrypto.prototype.ab_to_string = function(buffer) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer));
}

EchoesCrypto.prototype.string_to_ab = function(str) {
    var buffer = new ArrayBuffer(str.length);
    var view = new Uint8Array(buffer);
    for (var i=0; i < str.length; i++) {
        view[i] = str.charCodeAt(i);
    }
    return buffer;
}

EchoesCrypto.prototype.bytes_to_hex = function (buffer) {
    if (! buffer) {
        return null;
    }

    buffer = new Uint8Array(buffer);
    var hex = [];
    for (var i = 0; i < buffer.length; ++i) {
        var str = buffer[i].toString(16);
        if (str.length < 2) {
            str = "0" + str;
        }

        hex.push(str);
    }
    return hex.join('');
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
