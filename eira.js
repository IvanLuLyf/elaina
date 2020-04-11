(function ($) {
    'use strict';
    var NAME = 'Eira';
    var dataStorage = {};
    var events = {};
    var widgets = {};
    var prevPath = '';
    var appDiv, isDebug, pageVer, cacheExpireTime;
    var pageDir, widgetDir, scopeDir;

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
        var pk = scopeDir + '#' + view + '@' + pageDir;
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

    function replaceContent(isPage, $el, $pageData, $template) {
        if (typeof events['unload'] === "function") {
            events['unload']();
            delete events['unload'];
        }
        if (events['load']) delete events['load'];
        $template = $template || $pageData.find('template');
        $el.html($template.html());
        $el.prepend($pageData.find('style'));
        $el.append($pageData.find('script'));
        if (isPage) {
            var title = $pageData.find('title');
            if (title.length > 0) document.title = title.text();
            if (typeof events['load'] === 'function') events['load']();
        }
    }

    function replaceBlock(el, view, isPage) {
        var $el = $(el);
        if (view[view.length - 1] === '/') {
            view = view + 'index'
        }
        if (!isDebug) {
            var cacheHeml = pageCache(view);
            if (cacheHeml) {
                replaceContent(isPage, $el, $('<div>' + cacheHeml + '</div>'));
                return;
            }
        }
        $.ajax({
            url: pageDir + view + '.html' + (pageVer ? ('?v=' + pageVer) : ''),
            type: 'get',
            dataType: 'html',
            success: function (html) {
                var pageData = $('<div>' + html + '</div>');
                var template = pageData.find('template');
                if (template.length > 0) {
                    pageCache(view, html);
                    replaceContent(isPage, $el, pageData, template);
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
            if (typeof events['change'] === 'function') events['change'](pageInfo);
        } else {
            prevPath = pageInfo.path;
            delete events['change'];
            replaceBlock(appDiv, pageInfo.path, true);
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

    function prepareWidget(name, $widgetData, $template) {
        if (!widgets[name]) {
            widgets[name] = {};
        }
        $template = $template || $widgetData.find('template');
        widgets[name].html = $template.html();
        $(document.body).prepend($widgetData.find('style').attr('widget-style', name));
        $(document.body).append($widgetData.find('script').attr('widget-script', name));
    }

    function loadOneWidget(name, callback) {
        var widgetPath = widgetDir + '/' + name.split('.').join('/') + ".html";
        var cacheHtml = pageCache(widgetPath);
        if (cacheHtml) {
            prepareWidget(name, $('<div>' + cacheHtml + '</div>'));
            if (typeof callback === 'function') callback();
            return;
        }
        $.ajax({
            url: widgetPath + (pageVer ? ('?v=' + pageVer) : ''),
            type: 'get',
            dataType: 'html',
            success: function (html) {
                var pageData = $('<div>' + html + '</div>');
                var template = pageData.find('template');
                if (template.length > 0) {
                    pageCache(widgetPath, html);
                    prepareWidget(name, pageData, template);
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

    function widget(el, name, param) {
        var $el = $(el);
        if (typeof name === "undefined" && typeof param === "undefined") {
            return $el.data('pageWidget');
        }
        if (widgets[name]) {
            var Initializer = widgets[name].initializer;
            if (!$el.attr("widget")) {
                $el.data('origin', $el.html());
            } else {
                disposeWidget($el);
            }
            $el.html(widgets[name].html);
            var $slot = $el.find('slot');
            if ($slot.length === 1) {
                $slot.replaceWith($el.data('origin'));
            }
            if (typeof Initializer === 'function') {
                var handler = new Initializer($el, param);
                $el.data('pageWidget', handler);
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
        var oldHandler = $el.data('pageWidget');
        if (oldHandler) {
            if (typeof oldHandler.unload === "function") {
                oldHandler.unload();
            }
            oldHandler = undefined;
            $el.removeData('pageWidget');
            $el.removeAttr('widget');
            $el.find('[widget]').each(function () {
                disposeWidget($(this));
            });
        }
        $el.empty();
        $el.html($el.data('origin'));
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
        defineWidget: function (name, init) {
            defineWidget(name, init);
        },
        extendWidget: function (name, superClass, init) {
            extendWidget(name, superClass, init);
        },
        loadWidget: function (name, callback) {
            loadWidget(name, callback);
        },
        widget: function (el, name, param) {
            return widget(el, name, (param || {}));
        },
    };

    $.fn.extend({
        Eira: function (options) {
            configure($.extend({el: $(this)}, options));
            return this;
        }
    });
    $[NAME] = new Eira();
})(jQuery);
