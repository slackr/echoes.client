describe("EchoesObject", function() {
    var o;

    beforeEach(function() {
        o = new EchoesObject();
    });

    it("should log to log_levels only twice", function() {
        AppConfig.CONSOLE_LOG = false;
        AppConfig.LOG_LEVEL = 1;

        o.log('Test entry debug', 0);
        o.log('Test entry info', 1);
        o.log('Test entry error', 3);
        expect(o.log_entries.length).toEqual(2);
    });

    it("should log to console only", function() {
        AppConfig.CONSOLE_LOG = true;
        AppConfig.LOG_LEVEL = 0;

        o.log('Test entry debug', 0);
        o.log('Test entry info', 1);
        o.log('Test entry error', 3);
        expect(o.log_entries.length).toEqual(0);
    });
});
