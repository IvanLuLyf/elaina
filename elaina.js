;(function (root, name, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery'], function (jQuery) {
            return factory(name, jQuery);
        });
    } else if (typeof exports === 'object' && typeof module === 'object') {
        module.exports = factory(name, require('jquery'));
    } else {
        if (!root[name]) factory(name, root.jQuery);
    }
})(this, 'Elaina', function (NAME, $) {
    'use strict';
    var VERSION = '1.0.5';
    var MOD_POSTFIX = {
        'widget': '.html',
        'trait': '.js',
    };
    var DIRS = {}, SOURCES = {};
    var dataStorage = {};
    var events = {};
    var widgets = {}, traits = {};
    var widgetInstance = {}, widgetIndex = 0;
    var prevPath = '';
    var rootElem, isDebug, pageVer, cacheExpireTime;
    var page404;
    var LOGO = '  _____ _       _\n | ____| | __ _(_)_ __   __ _\n |  _| | |/ _` | | \'_ \\ / _` |\n | |___| | (_| | | | | | (_| |\n |_____|_|\\__,_|_|_| |_|\\__,_|\n\nPowered By ' + NAME + ' Ver ' + VERSION + '.';
    var AT_EVENTS = ['click', 'dblclick', 'change', 'input', 'contextmenu'];

    function logo(ret) {
        if (ret) return LOGO;
        console.log('%c%s', 'color:#1996ff;', LOGO)
    }

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
                    if (cookie(nameOrData) !== null) document.cookie = nameOrData + "=;expires=" + exp.toUTCString() + ";path=/;";
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
            if (c.v === pageVer && c.expire > Date.now()) {
                return c.content;
            } else {
                storage(pk, null);
            }
        } else {
            storage(pk, {
                v: pageVer,
                expire: Date.now() + cacheExpireTime,
                content: content,
            });
        }
    }

    function clearCache(cacheKey) {
        if (cacheKey) {
            storage('cache#' + cacheKey, null);
        } else {
            for (var k in localStorage) if (localStorage.hasOwnProperty(k) && startWith(k, NAME + '@' + DIRS.scope + '$cache#')) delete localStorage[k];
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

    function formatUrl(path, search, hash) {
        var q = $.param(search || {});
        return (path ? path : '') + (q ? ('?' + q) : '') + (hash ? ('#' + hash) : '');
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

    function processEvent(evt) {
        var evtArr = evt.match(/\((.*)\)$/) || [];
        return {
            name: evt.replace(evtArr[0], ''),
            param: evtArr[1] ? JSON.parse('[' + evtArr[1] + ']') : [],
        };
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
        }).then(function (html) {
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
        }).catch(function (err) {
            if (page404 && view !== page404) {
                replaceBlock($el, page404, isPage);
            } else {
                if (isPage) document.title = '404 Not Found';
                $el.html('<h1>404 Not Found</h1>');
            }
        });
    }

    var routerHandler = function (pageInfo) {
        if (pageInfo.path === prevPath) {
            if (typeof events['change'] === 'function') events['change'](pageInfo);
        } else {
            prevPath = pageInfo.path;
            delete events['change'];
            replaceBlock(rootElem, pageInfo.path, true, function () {
                if (typeof events['load'] === 'function') events['load']();
            });
        }
    };

    function renderPage() {
        routerHandler(parseRouter(window.location.hash.substring(1)));
    }

    function modInfo(name, baseNamespace, modType) {
        name = $.trim(name);
        if (!name) return null;
        modType = modType || 'widget';
        var reg = /(.*)\s+as\s+(.*)/;
        var originName = name, modId, aliasId, modPath, modSource, modPrefix, idArr, c = reg.exec(name);
        if (c) {
            originName = c[1];
            aliasId = c[2];
        }
        if (originName[0] === '@') {
            idArr = originName.substring(1).split('.');
            modId = idArr.pop();
            modPrefix = '@' + idArr.join('.');
            var source = 'https://eira.twimi.cn/', sn = idArr[0];
            if (SOURCES[sn]) {
                source = SOURCES[sn];
                idArr.shift();
            }
            modSource = source + modType;
        } else if (originName[0] === '.') {
            idArr = ((baseNamespace ? (baseNamespace + '.') : '') + originName.substring(1)).split('.');
            originName = idArr.join('.');
            modId = idArr.pop();
            modPrefix = idArr.join('.');
            modSource = DIRS[modType];
        } else {
            idArr = originName.split('.');
            modId = idArr.pop();
            modPrefix = idArr.join('.');
            modSource = DIRS[modType];
        }
        modPath = modSource + ('/' + idArr.join('/') + '/' + modId + MOD_POSTFIX[modType]).replace('//', '/');
        if (aliasId) modId = aliasId;
        return {
            id: modId,
            prefix: modPrefix,
            origin: originName,
            key: modType + '$' + originName,
            path: modPath,
        }
    }

    function defineWidgetBuilder(name) {
        return function defineWidget(initializer) {
            if (typeof initializer === 'object') {
                initializer = Widget.extend(initializer);
            }
            if (typeof initializer !== 'function') return console.error('Widget definition must be Object or Function');
            if (widgets[name].useTrait) {
                var traitList = widgets[name].useTrait.split(',');
                $.each(traitList, function (i, trait) {
                    $.each(traits[$.trim(trait)], function (func, fn) {
                        if (!initializer.prototype[func]) initializer.prototype[func] = fn;
                    });
                })
            }
            wrapWidget(initializer);
            widgets[name].initializer = initializer;
        }
    }

    function extendWidgetBuilder(name) {
        return function extendWidget(initializer, superClassName) {
            var parent = widgets[superClassName];
            if (!parent) return console.error('Base widget [' + superClassName + '] is not defined.');
            if (parent.isFinal) return console.error('Base widget [' + superClassName + '] is being declared as final.');
            var baseWidget = parent.initializer;
            if (!baseWidget.extend) {
                baseWidget = Widget.extend(parent.initializer.prototype);
                baseWidget.prototype.init = parent.initializer;
            }
            if (widgets[name].useTrait) {
                var traitList = widgets[name].useTrait.split(',');
                var tmpTraits = {};
                $.each(traitList, function (i, trait) {
                    tmpTraits = $.extend(tmpTraits, traits[$.trim(trait)]);
                });
                baseWidget = baseWidget.extend(tmpTraits);
            }
            var childWidget = baseWidget.extend(initializer);
            wrapWidget(childWidget);
            widgets[name].initializer = childWidget;
            if (!$.trim(widgets[name].content)) {
                widgets[name].content = parent.content;
            }
        }
    }

    function wrapWidget(initializer) {
        var eventKey = '_events' + Date.now();
        initializer.prototype.$on = function (name, callback) {
            if (typeof callback === 'function') {
                if (!this[eventKey]) this[eventKey] = {};
                this[eventKey][name] = callback;
            }
            return this;
        };
        initializer.prototype.$emit = function (name, param) {
            if (this[eventKey] && typeof this[eventKey][name] === 'function') return this[eventKey][name](param);
        };
        initializer.prototype.$dispose = function () {
            dispose(this.$el);
        };
    }

    function prepareWidget(widgetInfo, dependents, $widgetData, $template) {
        if (!widgets[widgetInfo.origin]) widgets[widgetInfo.origin] = {};
        if (typeof dependents === 'object') dependents[widgetInfo.origin] = widgets[widgetInfo.origin];
        widgets[widgetInfo.origin].dependencies = {};
        $template = $template || $widgetData.children('template');
        widgets[widgetInfo.origin].content = $template.html();
        $(document.body).prepend($widgetData.children('style').attr('widget-style', widgetInfo.origin));
        var $script = $widgetData.children('script');
        $script.attr('widget-script', widgetInfo.origin);
        var deferred = $.Deferred();
        loadWidget($script.attr('use-widget'), widgetInfo.prefix, widgets[widgetInfo.origin].dependencies).then(function () {
            widgets[widgetInfo.origin].useTrait = $script.attr('use-trait');
            return loadTrait($script.attr('use-trait'), widgetInfo.prefix);
        }).then(function () {
            widgets[widgetInfo.origin].isFinal = $script.attr('final') !== undefined;
            appSingleton.defineWidget = defineWidgetBuilder(widgetInfo.origin);
            appSingleton.extendWidget = extendWidgetBuilder(widgetInfo.origin);
            $(document.body).append($script);
            delete appSingleton.defineWidget;
            delete appSingleton.extendWidget;
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

    function loadWidget(widgetList, baseNamespace, dependencies) {
        var req = [];
        widgetList = widgetList || '';
        $.each(widgetList.split(','), function (i, name) {
            var info = modInfo(name, baseNamespace);
            if (!info || widgets[info.origin]) return;
            req.push(loadMod(info).then(function (res) {
                if (res.cached) return prepareWidget(info, dependencies, $('<div>' + res.content + '</div>'));
                var pageData = $('<div>' + res.content + '</div>');
                var template = pageData.children('template');
                if (template.length > 0) {
                    pageCache(info.key, res.content);
                    return prepareWidget(info, dependencies, pageData, template);
                } else {
                    isDebug && console.warn('invalid widget format.');
                }
            }));
        });
        return $.when.apply($, req);
    }

    function loadTrait(traitList, baseNamespace) {
        var req = [];
        traitList = traitList || '';
        $.each(traitList.split(','), function (i, name) {
            var info = modInfo(name, baseNamespace, 'trait');
            if (!info || traits[info.origin]) return;
            req.push(loadMod(info).then(function (res) {
                var func = new Function('window', '$', 'jQuery', res.content);
                var called = false;
                appSingleton.defineTrait = function (lib) {
                    if (typeof lib === 'object') {
                        traits[info.origin] = lib;
                        called = true;
                    }
                };
                func(window, $, $);
                delete appSingleton.defineTrait;
                if (!called && isDebug) console.warn('Trait [' + info.origin + '] is not defined');
                traits[info.id] = traits[info.origin];
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

    function popup(name, param) {
        var $el = $('<div popup>');
        $(document.body).append($el);
        return widget($el, name, param);
    }

    function widget(el, name, param) {
        var $el = $(el);
        if (typeof name === 'undefined' && typeof param === 'undefined') {
            return widgetInstance[$el.attr('widget')]
        }
        param = $.extend({}, param);
        if (widgets[name]) {
            var Initializer = widgets[name].initializer;
            if (!$el.attr('widget')) {
                var $children = $el.children();
                if ($children.length > 0) {
                    $el.data('origin', $children);
                } else {
                    $el.data('origin', $el.html());
                }
            }
            disposeWidget($el);
            $el.html(widgets[name].content);
            autoWidget($el);
            var $slot = $el.find('slot');
            if ($slot.length === 1) $slot.replaceWith($el.data('origin'));
            if ($slot.length > 1) {
                var $origin = $('<div></div>');
                $origin.append($el.data('origin'));
                $slot.each(function () {
                    var slotName = $(this).attr('name');
                    if (slotName) $(this).replaceWith($origin.find('[slot="' + slotName + '"]'));
                });
                $el.find('slot').replaceWith($origin.contents());
            }
            if (typeof Initializer === 'function') {
                var handler = new Initializer($el, param);
                handler.$el = $el[0];
                var widgetKey = '$' + name + ':' + (++widgetIndex);
                $el.attr('widget', widgetKey);
                if (typeof handler['created'] === "function") {
                    handler['created']();
                }
                $.each(AT_EVENTS, function (k, evt) {
                    $el.on(evt, '[\\@' + evt + ']', function (e) {
                        var evtInfo = processEvent($(this).attr('@' + evt));
                        if (typeof handler[evtInfo.name] === 'function') {
                            evtInfo.param.unshift(e);
                            handler[evtInfo.name].apply(handler, evtInfo.param);
                        }
                    });
                });
                widgetInstance[widgetKey] = handler;
                return handler;
            }
        }
    }

    function disposeWidget(el) {
        var $el = $(el), widgetKey = $el.attr('widget');
        if (widgetInstance[widgetKey]) {
            if (typeof widgetInstance[widgetKey].unload === "function") widgetInstance[widgetKey].unload();
            $el.removeAttr('widget');
            $el.find('[widget]').each(function () {
                disposeWidget($(this));
            });
            delete widgetInstance[widgetKey];
        }
        $el.off().empty();
        $el.html($el.data('origin'));
    }

    function dispose(el) {
        var $el = $(el);
        $el.find('[widget]').each(function () {
            disposeWidget($(this));
        });
        disposeWidget(el);
        if ($el.attr('popup') !== undefined) $el.remove();
        $el = null;
    }


    var initializing = false;

    function Widget() {
    }

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

    function isWidgetOf(instance, name) {
        if (typeof instance === 'object' && widgets[name] && typeof widgets[name].initializer === 'function') {
            return (instance instanceof widgets[name].initializer);
        }
        return false;
    }

    function configure(options) {
        options = options || {};
        DIRS.page = options.pages || 'page';
        DIRS.widget = options.widgets || (DIRS.page + '/widget');
        DIRS.trait = options.traits || (DIRS.page + '/trait');
        DIRS.scope = options.scope || ('/');
        $.extend(SOURCES, options.sources);
        isDebug = options.debug;
        pageVer = options.version;
        cacheExpireTime = options.expire || 604800;
        if (isDebug) logo();
        if (options.page404) {
            page404 = options.page404;
            if (page404[0] !== '/') {
                page404 = '/' + page404;
            }
        }
        mount(options.el);
    }

    function mount(el) {
        if (el && !rootElem) {
            rootElem = $(el);
            appSingleton.el = rootElem[0];
            $(function () {
                renderPage();
            });
            $(window).on('hashchange', function (e) {
                renderPage();
            });
        }
    }

    function bindEvent(evtName, callback) {
        if (typeof callback === 'function') events[evtName] = callback;
    }

    function Elaina() {

    }

    Elaina.prototype = {
        constructor: Elaina,
        logo: function (returns) {
            return logo(returns);
        },
        configure: function (options) {
            configure(options);
            return this;
        },
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
        clearCache: function (key) {
            clearCache(key);
        },
        router: function (hanlder) {
            if (typeof hanlder === 'function') {
                routerHandler = hanlder;
                return this;
            }
            return parseRouter(window.location.hash.substring(1));
        },
        formatUrl: function (path, search, hash) {
            return formatUrl(path, search, hash);
        },
        mount: function (el) {
            mount(el);
            return this;
        },
        navigate: function (path, search, hash) {
            window.location.hash = '#' + formatUrl(path, search, hash);
        },
        replace: function (path, search, hash) {
            window.location.replace('#' + formatUrl(path, search, hash))
        },
        on: function (evtName, callback) {
            bindEvent(evtName, callback);
        },
        render: function (el, view, callback) {
            replaceBlock(el, view, false, callback);
        },
        loadWidget: function (name, callback) {
            loadWidget(name, callback);
        },
        piece: function (el, param) {
            piece(el, param);
        },
        popup: function (name, param) {
            return popup(name, param);
        },
        widget: function (el, name, param) {
            return widget(el, name, param);
        },
        isWidgetOf: function (instance, name) {
            return isWidgetOf(instance, name);
        },
        dispose: function (el) {
            dispose(el);
        },
        VERSION: VERSION,
    };

    $.fn.extend({
        Elaina: function (options) {
            configure($.extend({el: $(this)}, options));
            return this;
        }
    });

    var appSingleton = new Elaina();
    $.Elaina = appSingleton;
    window.Elaina = appSingleton;
    return appSingleton;
});
