(function ($) {
    'use strict';
    var NAME = 'pageView';
    var dataStorage = {};
    var events = {};
    var prevPath = '';
    var pages, appDiv, isDebug, pageVer, cacheExpireTime;

    function data() {
        if (arguments.length === 0) {
            return dataStorage;
        } else if (arguments.length === 1) {
            return dataStorage[arguments[0]];
        } else {
            dataStorage[arguments[0]] = arguments[1];
        }
    }

    function storage(key, data) {
        if (!key) return;
        var realKey = NAME + '$' + key;
        if (data === null) return delete localStorage[realKey];
        if (typeof data === "undefined") {
            try {
                return JSON.parse(localStorage[realKey]);
            } catch (e) {
                return {};
            }
        }
        if (typeof data === 'object') localStorage.setItem(realKey, JSON.stringify(data));
    }

    function parseRouter(hash) {
        var match = hash.match(/^([\/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
        var qs = match[2].substring(1);
        var vs = qs.split('&');
        var query = {};
        for (var i = 0; i < vs.length; i++) {
            var vp = vs[i].split('=');
            if (vp[0] !== '')
                query[vp[0]] = vp[1];
        }
        return {
            path: match[1][0] === '/' ? match[1] : ('/' + match[1]),
            search: match[2],
            hash: match[3],
            query: query,
        }
    }

    function pageCache(view, html) {
        var pk = view + '@' + pages;
        if (typeof html === "undefined") {
            var c = storage(pk);
            if (c.v === pageVer && c.expire > (new Date().getTime())) {
                return c.html;
            } else {
                storage(pk, null);
            }
        } else {
            storage(pk, {
                v: pageVer,
                expire: (new Date()).getTime() + cacheExpireTime,
                html: html,
            });
        }
    }

    function replaceContent($el, $pageData, $template) {
        $template = $template || $pageData.find('template');
        var title = $pageData.find('title');
        if (title.length > 0) document.title = title.text();
        $el.html($template.html());
    }

    function replaceBlock(el, view, conf) {
        var $el = $(el);
        conf = conf || {};
        if (view[view.length - 1] === '/') {
            view = view + 'index'
        }
        if (!isDebug) {
            var cacheHeml = pageCache(view);
            if (cacheHeml) {
                replaceContent($el, $('<div>' + cacheHeml + '</div>'));
                return;
            }
        }
        $.ajax({
            url: pages + view + '.html',
            type: 'get',
            dataType: 'html',
            success: function (html) {
                var pageData = $('<div>' + html + '</div>');
                var template = pageData.find('template');
                if (template.length > 0) {
                    pageCache(view, html);
                    replaceContent($el, pageData, template);
                } else {
                    $el.html('<h1>404 Not Found</h1>');
                }
            },
            error: function (err) {
                $el.html('<h1>404 Not Found</h1>')
            }
        });
    }

    function renderPage() {
        var pageInfo = parseRouter(window.location.hash.substring(1));
        if (pageInfo.path === prevPath) {

        } else {
            replaceBlock(appDiv, pageInfo.path);
        }
    }

    function configure(options) {
        options = options || {};
        pages = options.pages;
        appDiv = options.el;
        isDebug = options.debug;
        pageVer = options.version;
        cacheExpireTime = options.expire || 604800;

        $(function () {
            renderPage();
        });

        $(window).on('hashchange', function (e) {
            renderPage();
        });
    }

    function PageView() {

    }

    PageView.prototype.data = function () {
        return data.apply(this, arguments);
    };

    PageView.prototype.storage = function () {
        return storage.apply(this, arguments);
    };

    PageView.prototype.router = function () {
        return parseRouter(window.location.hash.substring(1));
    };

    PageView.prototype.navigate = function (path, search, hash) {
        var q = $.param(search || {});
        window.location.hash = '#' + (path ? path : '') + (q ? ('?' + q) : '') + (hash ? ('#' + hash) : '');
    };

    $.fn.extend({
        pageView: function (options) {
            configure($.extend({el: $(this)}, options));
            return this;
        }
    });
    $.pageView = new PageView();
})(jQuery);
