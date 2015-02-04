describe("EchoesCrypto", function() {
    var c = new EchoesCrypto();

    AppConfig.CONSOLE_LOG = true;
    AppConfig.LOG_LEVEL = 0;

    /**
     * Test synchronous functions
     */
    describe("Synchronous methods", function() {
        it("should support 'crypto' feature", function() {
            c.does_browser_support('crypto');

            expect(c.browser_support['crypto'].supported).toBe(true);
        });
        it("should support 'ec' feature", function() {
            c.does_browser_support('ec');

            expect(c.browser_support['ec'].supported).toBe(true);
        });

        it("should generate two random IVs that don't match", function() {
            var iv_size = 128; // 128bit/16byte array
            var iv1 = c.new_iv(iv_size);
            var iv2 = c.new_iv(iv_size);

            expect(typeof iv1).toBe('object');
            expect(iv1.length).toEqual(iv_size / 8);
            expect(typeof iv2).toBe('object');
            expect(iv2.length).toEqual(iv_size / 8);
            expect(iv1).not.toEqual(iv2);
        });

        it("should encode and decode unicode characters properly", function() {
            var chars = "☃❄❅❆★☆✪✫✯⚝⚫⚹✵❉❋☃❄❅❆★☆✪✫✯⚝⚫⚹✵❉❋";
            var encoded = c.uni_encode(chars);
            var decoded = c.uni_decode(encoded);

            expect(decoded).toEqual(chars);
        });

        it("should create a specific hex value from a static uint8 buffer", function() {
            var buffer = new Uint8Array([69, 124, 79, 78, 100, 153, 64, 110, 156, 35, 48, 46, 49, 23, 191, 2]);
            var expected_hex = "457c4f4e6499406e9c23302e3117bf02";

            expect(c.bytes_to_hex(buffer)).toEqual(expected_hex);
        });
    });

    describe("Asynchronous methods", function() {
        /**
         * Loop test keychains
         */
        var test_keychains = {
            'encrypt': {
                export_chains: {
                    'encrypt_public': { expected: 'public_key' },
                }
            },
            'keyx': {
                export_chains: {
                    'keyx_public': { expected: 'public_key' },
                }
            },
            'sign': {
                export_chains: {
                    'sign_public': { expected: 'public_key' },
                    'sign_private': { expected: 'private_key' },
                }
            },
        };

        var test_genkey = function(kc) {
            it("should generate a keypair for '" + kc + "'", function(done) {
                var resolved = function(r) {
                    expect(c.keychain[kc].private_key).not.toBe(null);
                    expect(c.keychain[kc].public_key).not.toBe(null);
                    done();
                };
                var rejected = function(e) {
                    expect(e).toBeUndefined();
                    done();
                };

                c.generate_key(kc, true)
                    .then(resolved)
                    .catch(rejected);
            });
        }

        var test_exportkey = function(kc, export_chain, export_expected_keytype) {
            it("should export '" + export_chain + "' key from keychain '" + kc + "'", function(done) {
                var resolved = function(r) {
                    expect(c.keychain[kc].exported[export_expected_keytype]).not.toBe(null);
                    done();
                };
                var rejected = function(e) {
                    expect(e).toBeUndefined();
                    done();
                };

                c.export_key(export_chain)
                    .then(resolved)
                    .catch(rejected);
            });
        }

        for (var kc in test_keychains) {
            test_genkey(kc);
        }
        for (var kc in test_keychains) {
            for (var export_chain in test_keychains[kc].export_chains) {
                test_exportkey(kc, export_chain, test_keychains[kc].export_chains[export_chain].expected);
            }
        }

        /**
         * Hash test
         */
        var hash_test = { value: 'test', expected: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3'}
        it("should hash '" + hash_test.value + "' -> '" + hash_test.expected + "'", function(done) {
            var resolved = function(r) {
                expect(c.resulting_hash).toEqual(hash_test.expected);
                c.log('resulting hash: ' + c.resulting_hash, 1);
                done();
            };
            var rejected = function(e) {
                expect(e).toBeUndefined();
                done();
            };

            c.hash(hash_test.value)
                .then(resolved)
                .catch(rejected);
        });

        /**
         * Re-import previously exported keyx pubkey
         */
        it("should import a previously exported keyx key", function(done) {
            var resolved = function(r) {
                expect(c.keychain['keyx'].imported.public_key).not.toBe(null);
                c.log('imported key: ' + c.keychain['keyx'].imported.public_key, 1);
                done();
            };
            var rejected = function(e) {
                expect(e).toBeUndefined();
                done();
            };

            c.import_key('keyx', c.keychain['keyx'].exported.public_key, 'spki', true)
                .then(resolved)
                .catch(rejected);
        });

        /**
         * Derive symkey from re-imported keyx pubkey and existing keyx privkey
         */
        it("should derive a symkey from re-imported pubkey and privkey from keychain keyx", function(done) {
            var resolved = function(r) {
                expect(c.derived_key).not.toBe(null);
                c.log('derived key: ' + c.derived_key, 1);
                done();
            };
            var rejected = function(e) {
                expect(e).toBeUndefined();
                done();
            };

            c.derive_key(c.keychain['keyx'].private_key, c.keychain['keyx'].imported.public_key, true)
                .then(resolved)
                .catch(rejected);
        });

        /**
         * Encrypt and decrypt with the symmetric key derived earlier
         */
        var plaintexts = {
            empty_array: { value: [], expected: '' },
            empty_hash: { value: {}, expected: '' },
            nothing:  { value: null, expected: '' },
            blank:  { value: "", expected: '' },
            ascii_word:  { value: "test", expected: "test" },
            unicode_word:  { value: "☃✪✫✯", expected: "☃✪✫✯" },
            au_mix:  { value: "test ☃❄❅", expected: "test ☃❄❅" },
            au_mix_long:  { value: "test ☃❄❅❆★☆✪✫✯⚝⚫⚹✵❉❋☃❄❅❆★☆✪✫✯⚝⚫⚹✵❉❋☃❄❅❆★☆✪✫✯⚝⚫⚹✵❉❋", expected: "test ☃❄❅❆★☆✪✫✯⚝⚫⚹✵❉❋☃❄❅❆★☆✪✫✯⚝⚫⚹✵❉❋☃❄❅❆★☆✪✫✯⚝⚫⚹✵❉❋" },
        }

        var test_encrypt_decrypt = function(plaintext, plaintext_type, expected) {
            it("should encrypt plaintext using derived symkey for '" + plaintext_type + "'", function(done) {
                var resolved = function(r) {
                    expect(c.encrypted_segments.length).toBeGreaterThan(2); // 3: 0=iv, 1=aad, 2+=ciphertext
                    c.log('encrypted segments: ' + c.encrypted_segments, 1);
                    done();
                };
                var rejected = function(e) {
                    expect(e).toBeUndefined();
                    done();
                };

                c.encrypt_sym(plaintext, c.derived_key)
                    .then(resolved)
                    .catch(rejected);
            });

            it("should decrypt plaintext using derived symkey for '" + plaintext_type + "'", function(done) {
                var resolved = function(r) {
                    expect(c.decrypted_text).toBe(expected);
                    c.log("decrypted text: '" + c.decrypted_text + "' == '" + expected + "'", 1);
                    done();
                };
                var rejected = function(e) {
                    expect(e).toBeUndefined();
                    done();
                };

                c.decrypt_sym(c.encrypted_segments, c.derived_key)
                    .then(resolved)
                    .catch(rejected);
            });

            it("should encrypt plaintext using pubkey for '" + plaintext_type + "'", function(done) {
                var resolved = function(r) {
                    expect(c.encrypted_segments.length).toBeGreaterThan(0);
                    c.log('encrypted segments: ' + c.encrypted_segments, 1);
                    done();
                };
                var rejected = function(e) {
                    expect(e).toBeUndefined();
                    done();
                };

                c.encrypt_asym(plaintext, c.keychain['encrypt'].public_key)
                    .then(resolved)
                    .catch(rejected);
            });

            it("should decrypt plaintext using privkey for '" + plaintext_type + "'", function(done) {
                var resolved = function(r) {
                    expect(c.decrypted_text).toBe(expected);
                    c.log("decrypted text: '" + c.decrypted_text + "' == '" + expected + "'", 1);
                    done();
                };
                var rejected = function(e) {
                    expect(e).toBeUndefined();
                    done();
                };

                c.decrypt_asym(c.encrypted_segments, c.keychain['encrypt'].private_key)
                    .then(resolved)
                    .catch(rejected);
            });
        }

        for (var pt in plaintexts) {
            test_encrypt_decrypt(plaintexts[pt].value, pt, plaintexts[pt].expected);
        }
    });
});
