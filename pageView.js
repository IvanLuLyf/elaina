(function ($) {
    "use strict";
    var dataStorage = {};
    var pages;
    var appDiv;
    var isDebug;

    function PageView() {

    }

    function parseRouter(hash) {
        var match = hash.match(/^([\/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
        var qs = match[2].substring(1);
        var vs = qs.split("&");
        var query = {};
        for (var i = 0; i < vs.length; i++) {
            var vp = vs[i].split("=");
            if (vp[0] !== '')
                query[vp[0]] = vp[1];
        }
        return {
            path: match[1][0] === '/' ? match[1] : ("/" + match[1]),
            search: match[2],
            hash: match[3],
            query: query,
        }
    }

    PageView.prototype.data = function () {
        if (arguments.length === 0) {
            return dataStorage;
        } else if (arguments.length === 1) {
            return dataStorage[arguments[0]];
        } else {
            dataStorage[arguments[0]] = arguments[1];
        }
    };

    PageView.prototype.navigate = function (path, search, hash) {
        var q = $.param(search || {});
        window.location.hash = "#" + (path ? path : '') + (q ? ("?" + q) : "") + (hash ? ("#" + hash) : "");
    };

    $.fn.extend({
        pageView: function (options) {
            pages = options.pages;
            appDiv = $(this);
            isDebug = options.debug;

            $(window).on('hashchange', function (e) {
                console.log(parseRouter(window.location.hash.substring(1)));
            });
        }
    });
    $.pageView = new PageView();
})(jQuery);
