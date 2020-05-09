(function ($) {
    'use strict';
    var NAME = 'Eira';
    var dataStorage = {};
    var events = {};
    var widgets = {};
    var prevPath = '';
    var appDiv, isDebug, pageVer, cacheExpireTime;
    var pageDir, widgetDir, scopeDir;
    var page404;

    function data() {
        if (arguments.length === 0) {
            return dataStorage;
        } else if (arguments.length === 1) {
            if (typeof arguments[0] === 'object') {
                $.extend(dataStorage, arguments[0]);
            } else {
                return dataStorage[arguments[0]];
            }
        } else {
            dataStorage[arguments[0]] = arguments[1];
        }
    }

    function storage(key, data) {
        if (!key) return;
        var realKey = NAME + '@' + scopeDir + '$' + key;
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
        if (isDebug) return;
        var pk = 'cache#' + view + '@' + pageDir;
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

    function startWith(str, find) {
        return str.substring(0, find.length) === find;
    }

    function getProp(el, $parent, extra) {
        var props = {};
        extra = extra || {};
        var attrs = el.attributes;
        for (var i = 0; i < attrs.length; i++) {
            var n = attrs[i].nodeName;
            if (startWith(n.toLowerCase(), 'prop-')) {
                if ($parent) {
                    props[n.substring(5)] = extra[attrs[i].value] || $parent.data(attrs[i].value);
                } else {
                    props[n.substring(5)] = attrs[i].value;
                }
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
        if ($script.attr('use-widget')) {
            var widgetList = $script.attr('use-widget').split(',');
            loadWidget(widgetList, function () {
                autoWidget($el);
                $el.append($script);
                if (typeof callback === 'function') callback();
            });
        } else {
            autoWidget($el);
            $el.append($script);
            if (typeof callback === 'function') callback();
        }
    }

    function replaceBlock(el, view, isPage, callback) {
        var $el = $(el);
        if (view[0] !== '/') view = '/' + view;
        if (view[view.length - 1] === '/') view = view + 'index'
        if (!isDebug) {
            var cacheHeml = pageCache(view);
            if (cacheHeml) {
                replaceContent($el, isPage, callback, $('<div>' + cacheHeml + '</div>'));
                return;
            }
        }
        $.ajax({
            url: pageDir + view + '.html' + (pageVer ? ('?v=' + pageVer) : ''),
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

    function widgetInfo(name) {
        name = name.trim();
        if (!name) return null;
        var reg = /(.*)\s+as\s+(.*)/;
        var originName = name;
        var widgetId;
        var widgetPath;
        var ws;
        var c = reg.exec(name);
        if (c) {
            originName = c[1];
            widgetId = c[2];
        }
        if (originName[0] === '@') {
            ws = originName.substring(1).split('.');
            if (!widgetId) widgetId = ws.pop();
            widgetPath = 'https://eira.twimi.cn/widget/' + ws.join('/') + '/' + widgetId + '.html';
        } else {
            ws = originName.split('.');
            if (!widgetId) widgetId = ws.pop();
            widgetPath = widgetDir + '/' + ws.join('/') + '/' + widgetId + '.html';
        }
        return {
            id: widgetId,
            origin: originName,
            key: 'widget$' + originName,
            path: widgetPath,
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
        if (!widgets[widgetInfo.origin]) {
            widgets[widgetInfo.origin] = {};
        }
        $template = $template || $widgetData.children('template');
        widgets[widgetInfo.origin].html = $template.html();
        $(document.body).prepend($widgetData.children('style').attr('widget-style', widgetInfo.origin));
        var $script = $widgetData.children('script');
        $.Eira.defineWidget = function (initializer) {
            defineWidget(widgetInfo.origin, initializer);
        };
        $script.attr('widget-script', widgetInfo.origin);
        if ($script.attr('use-widget')) {
            var widgetList = $script.attr('use-widget').split(',');
            loadWidget(widgetList, function () {
                $(document.body).append($script);
                delete $.Eira.defineWidget;
            });
        } else {
            $(document.body).append($script);
            delete $.Eira.defineWidget;
        }
        if (!widgets[widgetInfo.id]) {
            widgets[widgetInfo.id] = widgets[widgetInfo.origin];
        }
    }

    function loadOneWidget(name, callback) {
        var info = widgetInfo(name);
        if (!info || widgets[info.origin]) {
            if (typeof callback === 'function') callback();
            return;
        }
        var cacheHtml = pageCache(info.key);
        if (cacheHtml) {
            prepareWidget(info, $('<div>' + cacheHtml + '</div>'));
            if (typeof callback === 'function') callback();
            return;
        }
        $.ajax({
            url: info.path + (pageVer ? ('?v=' + pageVer) : ''),
            type: 'get',
            dataType: 'html',
            success: function (html) {
                var pageData = $('<div>' + html + '</div>');
                var template = pageData.children('template');
                if (template.length > 0) {
                    pageCache(info.key, html);
                    prepareWidget(info, pageData, template);
                    if (typeof callback === 'function') callback();
                }
            }, error: function (err) {
                console.log(err);
            }
        })
    }

    function loadWidget(name, callback) {
        if ($.isArray(name)) {
            var i = 0;
            var cb = function () {
                i++;
                if (i < name.length && typeof name[i] !== "undefined") {
                    loadOneWidget(name[i], cb);
                } else {
                    if (typeof callback === 'function') callback();
                }
            };
            loadOneWidget(name[i], cb);
        } else {
            loadOneWidget(name, callback);
        }
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
        pageDir = options.pages || 'page';
        widgetDir = options.widgets || (pageDir + '/widget');
        scopeDir = options.scope || ('/');
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
    $.Eira = new Eira();
})(jQuery);
