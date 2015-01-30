describe("EchoesCrypto", function() {
    var c;

    beforeEach(function() {
        c = new EchoesCrypto();
        AppConfig.CONSOLE_LOG = true;
        AppConfig.LOG_LEVEL = 0;

        c.does_browser_support('crypto');
        c.does_browser_support('ec');
    });

    it("should generate a public and private keypair for 'encrypt'", function(done) {
        var resolved = function(r) {
            expect(c.keychain['encrypt'].private_key).not.toBe(null);
            expect(c.keychain['encrypt'].public_key).not.toBe(null);
            done();
        };
        var rejected = function(e) {
            expect(e).toBeUndefined();
            done();
        };

        c.generate_key('encrypt', false)
            .then(resolved)
            .catch(rejected);
    });

    it("should generate a public and private keypair for 'keyx'", function(done) {
        var resolved = function(r) {
            expect(c.keychain['keyx'].private_key).not.toBe(null);
            expect(c.keychain['keyx'].public_key).not.toBe(null);
            done();
        };
        var rejected = function(e) {
            expect(e).toBeUndefined();
            done();
        };

        c.generate_key('keyx', false)
            .then(resolved)
            .catch(rejected);
    });
});
