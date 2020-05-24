;(function (name, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery'], function () {
            return factory(name, window.jQuery);
        });
    } else {
        if (!window['$' + name]) factory(name, window.jQuery);
    }
})('Eira', function (NAME, $) {
    'use strict';
    var MOD_POSTFIX = {
        'widget': '.html',
        'trait': '.js',
    };
    var DIRS = {};
    var dataStorage = {};
    var events = {};
    var widgets = {};
    var prevPath = '';
    var appDiv, isDebug, pageVer, cacheExpireTime;
    var page404;

    function data(keyOrData, value) {
        if (typeof keyOrData === 'undefined') return dataStorage;
        if (typeof keyOrData === 'object') {
            $.extend(dataStorage, keyOrData);
        } else {
            if (typeof value === 'undefined') return dataStorage[keyOrData];
            if (value === null) return delete dataStorage[keyOrData];
            dataStorage[keyOrData] = value;
        }
    }

    function storageData(storage, key, data) {
        if (!key) return;
        var realKey = NAME + '@' + DIRS.scope + '$' + key;
        if (data === null) return delete storage[realKey];
        if (typeof data === "undefined") {
            try {
                return JSON.parse(storage[realKey]);
            } catch (e) {
                return {};
            }
        }
        if (typeof data === 'object') storage.setItem(realKey, JSON.stringify(data));
    }

    function storage(key, data) {
        return storageData(localStorage, key, data);
    }

    function session(key, data) {
        return storageData(sessionStorage, key, data);
    }

    function cookie(nameOrData, valueOrSecond, second) {
        var exp = new Date(), defaultExpire = 2592000;
        if (typeof nameOrData === 'object') {
            exp.setTime(exp.getTime() + (valueOrSecond || defaultExpire) * 1000);
            for (var k in nameOrData) if (nameOrData.hasOwnProperty(k)) document.cookie = k + "=" + escape(nameOrData[k]) + ";expires=" + exp.toUTCString() + ";path=/;";
        } else if (typeof nameOrData === 'undefined') {
            var allCookies = {}, cs, cArr = document.cookie.split(';');
            for (var i = 0; i < cArr.length; i++) {
                cs = cArr[i].split('=');
                allCookies[$.trim(cs[0])] = escape($.trim(cs[1]));
            }
            return allCookies;
        } else {
            if (typeof valueOrSecond === 'undefined') {
                var arr = document.cookie.match(new RegExp("(^| )" + nameOrData + "=([^;]*)(;|$)"));
                return (arr !== null) ? unescape(arr[2]) : null;
            } else {
                if (valueOrSecond === null) {
                    exp.setTime(exp.getTime() - 1);
                    if (cookieData(nameOrData) !== null) document.cookie = nameOrData + "=;expires=" + exp.toUTCString() + ";path=/;";
                } else {
                    exp.setTime(exp.getTime() + (second || defaultExpire) * 1000);
                    document.cookie = nameOrData + "=" + escape(valueOrSecond) + ";expires=" + exp.toUTCString() + ";path=/;";
                }
            }
        }
    }

    function parseRouter(hash) {
        var match = hash.match(/^([\/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
        var qs = match[2].substring(1);
        var vs = qs.split('&');
        var query = {};
        for (var i = 0; i < vs.length; i++) {
            var vp = vs[i].split('=');
            if (vp[0] !== '') query[vp[0]] = vp[1];
        }
        return {
            path: match[1][0] === '/' ? match[1] : ('/' + match[1]),
            search: match[2],
            hash: match[3],
            query: query,
        }
    }

    function pageCache(cacheKey, content) {
        if (isDebug) return;
        var pk = 'cache#' + cacheKey;
        if (typeof content === "undefined") {
            var c = storage(pk);
            if (c.v === pageVer && c.expire > (new Date().getTime())) {
                return c.content;
            } else {
                storage(pk, null);
            }
        } else {
            storage(pk, {
                v: pageVer,
                expire: (new Date()).getTime() + cacheExpireTime,
                content: content,
            });
        }
    }

    function startWith(str, find) {
        return str.substring(0, find.length) === find;
    }

    function dashToCamel(text) {
        if (!text) return text;
        return text.replace(/-(\w)/g, function (all, letter) {
            return letter.toUpperCase();
        });
    }

    function camelToDash(text) {
        if (!text) return text;
        return text.replace(/([A-Z])/g, "-$1").toLowerCase();
    }

    function getProp(el, $parent, extra) {
        var props = {};
        extra = extra || {};
        var attrs = el.attributes;
        for (var i = 0; i < attrs.length; i++) {
            var n = attrs[i].nodeName;
            if (startWith(n.toLowerCase(), 'prop-')) {
                props[dashToCamel(n.substring(5))] = $parent ? (extra[attrs[i].value] || $parent.data(attrs[i].value)) : attrs[i].value;
            }
        }
        return props;
    }

    function autoWidget($el, extra) {
        var $widgets = $el.find('[auto-widget]');
        $widgets.each(function () {
            var $w = $(this);
            if ($w.closest($el).length > 0) {
                var props = getProp($w[0], $el, extra);
                widget($w, $w.attr('auto-widget'), $.extend(props, $w.data()));
            }
        });
    }

    function replaceContent($el, isPage, callback, $pageData, $template) {
        if (isPage) {
            if (typeof events['unload'] === "function") {
                events['unload']();
                delete events['unload'];
            }
            if (events['load']) delete events['load'];
        }
        $el.find('[widget]').each(function () {
            disposeWidget($(this));
        });
        $template = $template || $pageData.children('template');
        $el.empty().html($template.html());
        $el.prepend($pageData.children('style'));
        var $script = $pageData.children('script');
        var title = $pageData.children('title');
        if (title.length > 0) document.title = title.text();
        loadWidget($script.attr('use-widget')).then(function () {
            autoWidget($el);
            $el.append($script);
            if (typeof callback === 'function') callback();
        });
    }

    function replaceBlock(el, view, isPage, callback) {
        var $el = $(el);
        if (view[0] !== '/') view = '/' + view;
        if (view[view.length - 1] === '/') view = view + 'index';
        if (!isDebug) {
            var cacheHeml = pageCache(view);
            if (cacheHeml) {
                replaceContent($el, isPage, callback, $('<div>' + cacheHeml + '</div>'));
                return;
            }
        }
        $.ajax({
            url: DIRS.page + view + '.html' + (pageVer ? ('?v=' + pageVer) : ''),
            type: 'get',
            dataType: 'html',
            success: function (html) {
                var pageData = $('<div>' + html + '</div>');
                var template = pageData.children('template');
                if (template.length > 0) {
                    pageCache(view, html);
                    replaceContent($el, isPage, callback, pageData, template);
                } else {
                    if (page404 && view !== page404) {
                        replaceBlock($el, page404, isPage);
                    } else {
                        if (isPage) document.title = '404 Not Found';
                        $el.html('<h1>404 Not Found</h1>');
                    }
                }
            },
            error: function (err) {
                if (page404 && view !== page404) {
                    replaceBlock($el, page404, isPage);
                } else {
                    if (isPage) document.title = '404 Not Found';
                    $el.html('<h1>404 Not Found</h1>');
                }
            }
        });
    }

    function renderPage() {
        var pageInfo = parseRouter(window.location.hash.substring(1));
        if (pageInfo.path === prevPath) {
            if (typeof events['change'] === 'function') events['change'](pageInfo);
        } else {
            prevPath = pageInfo.path;
            delete events['change'];
            replaceBlock(appDiv, pageInfo.path, true, function () {
                if (typeof events['load'] === 'function') events['load']();
            });
        }
    }

    function modInfo(name, modType) {
        name = $.trim(name);
        if (!name) return null;
        modType = modType || 'widget';
        var reg = /(.*)\s+as\s+(.*)/;
        var originName = name, modId, aliasId, modPath, idArr, c = reg.exec(name);
        if (c) {
            originName = c[1];
            aliasId = c[2];
        }
        if (originName[0] === '@') {
            idArr = originName.substring(1).split('.');
            modId = idArr.pop();
            modPath = 'https://eira.twimi.cn/' + modType + '/' + idArr.join('/') + '/' + modId + MOD_POSTFIX[modType];
        } else {
            idArr = originName.split('.');
            modId = idArr.pop();
            modPath = DIRS[modType] + '/' + idArr.join('/') + '/' + modId + MOD_POSTFIX[modType];
        }
        if (aliasId) modId = aliasId;
        return {
            id: modId,
            origin: originName,
            key: modType + '$' + originName,
            path: modPath,
        }
    }

    function defineWidget(name, initializer) {
        widgets[name].initializer = initializer;
    }

    function extendWidget(name, superClass, initializer) {
        widgets[name].initializer = widgets[superClass].initializer.extend(initializer);
        if (widgets[name].html.trim() === '') {
            widgets[name].html = widgets[superClass].html;
        }
    }

    function prepareWidget(widgetInfo, $widgetData, $template) {
        if (!widgets[widgetInfo.origin]) widgets[widgetInfo.origin] = {};
        $template = $template || $widgetData.children('template');
        widgets[widgetInfo.origin].html = $template.html();
        $(document.body).prepend($widgetData.children('style').attr('widget-style', widgetInfo.origin));
        var $script = $widgetData.children('script');
        $script.attr('widget-script', widgetInfo.origin);
        var deferred = $.Deferred();
        loadWidget($script.attr('use-widget')).then(function () {
            eiraInstance.defineWidget = function (initializer) {
                defineWidget(widgetInfo.origin, initializer);
            };
            $(document.body).append($script);
            delete eiraInstance.defineWidget;
            deferred.resolve();
        });
        if (!widgets[widgetInfo.id]) widgets[widgetInfo.id] = widgets[widgetInfo.origin];
        return deferred;
    }

    function loadMod(info) {
        var deferred = $.Deferred();
        var cacheData = pageCache(info.key);
        if (cacheData) return deferred.resolve({content: cacheData, cached: true}).promise();
        $.ajax({
            url: info.path + (pageVer ? ('?v=' + pageVer) : ''),
            type: 'get',
            dataType: 'text',
        }).then(function (content) {
            deferred.resolve({
                content: content,
            });
        }).fail(function (err) {
            deferred.resolve({});
        });
        return deferred.promise();
    }

    function loadWidget(widgetList) {
        var req = [];
        widgetList = widgetList || '';
        $.each(widgetList.split(','), function (i, name) {
            var info = modInfo(name);
            if (!info || widgets[info.origin]) return;
            req.push(loadMod(info).then(function (res) {
                if (res.cached) return prepareWidget(info, $('<div>' + res.content + '</div>'));
                var pageData = $('<div>' + res.content + '</div>');
                var template = pageData.children('template');
                if (template.length > 0) {
                    pageCache(info.key, res.content);
                    return prepareWidget(info, pageData, template);
                } else {
                    isDebug && console.warn('invalid widget format.');
                }
            }));
        });
        return $.when.apply($, req);
    }

    function piece(el, param) {
        var $el = $(el);
        $el.find('[widget]').each(function () {
            disposeWidget($(this));
        });
        autoWidget($el, param);
    }

    function widget(el, name, param) {
        var $el = $(el);
        if (typeof name === "undefined") {
            return $el.data('widgetHandler');
        }
        param = param || {};
        if (widgets[name]) {
            var Initializer = widgets[name].initializer;
            if (!$el.attr("widget")) {
                var $children = $el.children();
                if ($children.length > 0) {
                    $el.data('origin', $children);
                } else {
                    $el.data('origin', $el.html());
                }
            }
            disposeWidget($el);
            $el.html(widgets[name].html);
            autoWidget($el);
            var $slot = $el.find('slot');
            if ($slot.length > 0) {
                $slot.replaceWith($el.data('origin'));
            }
            if (typeof Initializer === 'function') {
                var handler = new Initializer($el, param);
                $el.data('widgetHandler', handler);
                $el.attr('widget', name);
                if (typeof handler['created'] === "function") {
                    handler['created']();
                }
                return handler;
            }
        }
    }

    function disposeWidget(el) {
        var $el = $(el);
        var oldHandler = $el.data('widgetHandler');
        if (oldHandler) {
            if (typeof oldHandler.unload === "function") {
                oldHandler.unload();
            }
            oldHandler = undefined;
            $el.removeData('widgetHandler');
            $el.removeAttr('widget');
            $el.find('[widget]').each(function () {
                disposeWidget($(this));
            });
        }
        $el.empty();
        $el.html($el.data('origin'));
    }

    function dispose(el) {
        var $el = $(el);
        $el.find('[widget]').each(function () {
            disposeWidget($(this));
        });
        disposeWidget(el);
        $el = null;
    }


    var initializing = false;

    window.Widget = function () {
    };

    Widget.extend = function widgetExtends(props) {
        var _super = this.prototype;
        initializing = true;
        var prototype = new this();
        initializing = false;
        for (var name in props) {
            if (props.hasOwnProperty(name)) {
                if (typeof props[name] === "function" && typeof _super[name] === "function" && /\$\bsuper\b/.test(props[name])) {
                    prototype[name] = (function (name, fn) {
                        return function () {
                            var tmp = this.$super;
                            this.$super = _super[name];
                            var ret = fn.apply(this, arguments);
                            this.$super = tmp;
                            return ret;
                        }
                    })(name, props[name])
                } else {
                    prototype[name] = props[name];
                }
            }
        }

        function Class($elem) {
            if (!initializing && this.init) {
                this.init.apply(this, arguments);
            }
        }

        Class.prototype = prototype;
        Class.constructor = Class;
        Class.extend = widgetExtends;
        return Class;
    };

    function configure(options) {
        options = options || {};
        DIRS.page = options.pages || 'page';
        DIRS.widget = options.widgets || (DIRS.page + '/widget');
        DIRS.trait = options.traits || (DIRS.page + '/trait');
        DIRS.scope = options.scope || ('/');
        appDiv = options.el;
        isDebug = options.debug;
        pageVer = options.version;
        cacheExpireTime = options.expire || 604800;
        if (options.page404) {
            page404 = options.page404;
            if (page404[0] !== '/') {
                page404 = '/' + page404;
            }
        }

        $(function () {
            renderPage();
        });

        $(window).on('hashchange', function (e) {
            renderPage();
        });
    }

    function bindEvent(evtName, callback) {
        if (typeof callback === 'function') events[evtName] = callback;
    }

    function Eira() {

    }

    Eira.prototype = {
        constructor: Eira,
        data: function () {
            return data.apply(this, arguments);
        },
        storage: function () {
            return storage.apply(this, arguments);
        },
        session: function () {
            return session.apply(this, arguments);
        },
        cookie: function () {
            return cookie.apply(this, arguments);
        },
        router: function () {
            return parseRouter(window.location.hash.substring(1));
        },
        navigate: function (path, search, hash) {
            var q = $.param(search || {});
            window.location.hash = '#' + (path ? path : '') + (q ? ('?' + q) : '') + (hash ? ('#' + hash) : '');
        },
        on: function (evtName, callback) {
            bindEvent(evtName, callback);
        },
        render: function (el, view, callback) {
            replaceBlock(el, view, false, callback);
        },
        extendWidget: function (name, superClass, init) {
            extendWidget(name, superClass, init);
        },
        loadWidget: function (name, callback) {
            loadWidget(name, callback);
        },
        piece: function (el, param) {
            piece(el, param);
        },
        widget: function (el, name, param) {
            return widget(el, name, param);
        },
        dispose: function (el) {
            dispose(el);
        },
    };

    $.fn.extend({
        Eira: function (options) {
            configure($.extend({el: $(this)}, options));
            return this;
        }
    });

    var eiraInstance = new Eira();
    $.Eira = eiraInstance;
    return eiraInstance;
});
