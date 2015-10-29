var cssParser = require('../css');
var common = require('./common.js');
var _ = require('underscore');


var compilers = {
    compile: function(vm) {
        compilers.compileViewModels(vm);
        return vm;
    },


    compileViewModels: function(vm) {
        var childVm;

        compilers.compileElements(vm, [vm.$el]);

        if (!vm.__states.children) return;

        for (var i = 0, l = vm.__states.children.length; i < l; i++) {
            childVm = vm.__states.children[i];
            compilers.compileViewModels(childVm);
        }
    },


    compileElements: function(vm, elements) {
        var element;

        for (var i = 0, l = elements.length; i < l; i++) {
            element = common.setElement(elements[i]);
            compilers.compileElement(vm, element); 
        }
    },


    compileElement: function(vm, element) {
        var foreignKeyElement = false;

        // В зависимости от того, является ли этот элемент ключевым для контекста v-repeat-а или нет
        // нужно по-разному его компилировать
        // если это элемент v-repeat-а, то и он сам и его кишки компилируются в контексте repeat-а
        // если же это элемент ТОЛЬКО компонента, то его собственные аттрибуты компилируются
        // в контексте родительского vm-а, а кишки - в собственном контексте
        if (element._isKeyElement && vm.$el != element) {
            foreignKeyElement = true;
        }

        // _compileSelfInParentVm присвоено элементам НЕ из v-repeat
        if (foreignKeyElement) {
            if (element._compileSelfInParentVm) {
                compilers.compileTag(vm, element);
            }

            return;
        }

        compilers.compileTag(vm, element);

        // Текстовая нода
        if (element.type === 'text') {
            element.text = common.execute(vm, element.text);
        }


        // Дочерние элементы тега
        if (element.inner) {
            compilers.compileElements(vm, element.inner);
        }
    },


    compileTag: function(vm, element) {
        if (element.compiled) {
            return;
        }
        
        if (element.type === 'tag') {
            // v-model
            if (element.dirs.model) {
                compilers.compileDirectiveModel(vm, element);
            }
            

            // v-text
            if (element.dirs.text) {
                compilers.setInnerText(
                    element,
                    common.execute(vm, {
                        value: element.dirs.text.value.get,
                        filters: element.dirs.text.value.filters,
                        isEscape: true,
                        isClean: true
                    })
                );
            }


            // v-html
            if (element.dirs.html) {
                compilers.setInnerText(
                    element,
                    common.execute(vm, {
                        value: element.dirs.html.value.get,
                        filters: element.dirs.html.value.filters,
                        isEscape: false,
                        isClean: true
                    })
                );
            }


            // v-el
            if (element.dirs.el) {
                // Not done yet
            }

            // Компилируем аттрибуты тега
            for (var key in element.attribs) {
                element.attribs[key] = common.execute(vm, element.attribs[key]);
            }

            compilers.compileAttributeDirectives(vm, element);




            // NEW SYNTAX
            // v-bind
            if (element.dirs.bind) {
                for (var i = element.dirs.bind.length - 1; i >= 0; i--) {
                    (function() {
                        // Тот случай, когда пропертя используется для передачи данных в компонент
                        // через props. Значит её не нужно рендерить как атрибут
                        if (element.dirs.bind[i].isProp) {
                            return;
                        }
                        
                        var name = element.dirs.bind[i].name;
                        var value = common.execute(vm, {
                            value: element.dirs.bind[i].value.get,
                            filters: element.dirs.bind[i].value.filters,
                        });

                        if (name === 'style') {
                            // Нужно учесть собственные стили элемента
                            var originalStyle = element.attribs.style;
                            if (originalStyle) {
                                originalStyle = cssParser.parse(originalStyle);
                            } else {
                                originalStyle = {};
                            }

                            // Обрабатываем значение, если класс пришёл в формате массива
                            if (Array.isArray(value)) {
                                value = common.extend.apply(common, value);
                            }
                            element.attribs[name] = cssParser.stringify(common.extend(originalStyle, value));

                            return;
                        }

                        if (name === 'class') {
                            (function() {
                                var classList = [];
                                var vClassItem;

                                if (element.attribs.class) {
                                    classList = element.attribs.class.split(' ');
                                    classList = classList.filter(function (item) {
                                        return item;
                                    });
                                }

                                if (Array.isArray(value)) {
                                    classList = value;
                                } else {
                                    for (var name in value) {
                                        if (value[name]) {
                                            classList.push(name);
                                        }
                                    }
                                }

                                element.attribs.class = _.uniq(classList).join(' ');
                            })();

                            return;
                        }



                        element.attribs[name] = value;
                    })();
                }
            }


            // setSelected (hack for v-for <select> options)
            if (element.dirs.setSelected) {
                // Нужно как-то по-другому это делать
                if (element.dirs.setSelected.value[element.attribs.value]) {
                    element.attribs.selected = 'selected';
                }
            }



            element.compiled = true;
        }
    },

    setInnerText: function(element, text) {
        element.inner = [{
            'type': 'text',
            'text': text
        }];
    },

    compileAttributeDirectives: function(vm, element) {
        // v-class
        if (element.dirs.class) {
            var classList;
            var vClassItem;

            if (element.attribs.class) {
                classList = element.attribs.class.split(' ');
                classList = classList.filter(function (item) {
                    return item;
                });
            } else {
                classList = [];
            }

            // Когда классы прописаны в самой директиве
            if (Array.isArray(element.dirs.class.value)) {
                for (var i = 0; i < element.dirs.class.value.length; i++) {
                    vClassItem = element.dirs.class.value[i];

                    if ( common.execute(vm, {value: vClassItem.get}) ) {
                        classList.push(vClassItem.arg);
                    }
                }

            // Когда переданы объектом
            } else {
                vClassItem = common.execute(vm, {value: element.dirs.class.value.get});

                for (var name in vClassItem) {
                    if (vClassItem[name]) {
                        classList.push(vClassItem[name]);
                    }
                }
            }

            element.attribs.class = _.uniq(classList).join(' ');
        }
        
        // v-style && v-show
        var styles = {};
        var originalStyle = element.attribs.style;
        if (originalStyle) {
            originalStyle = cssParser.parse(originalStyle);
        }

        if (element.dirs.style && element.dirs.show) {
            // Правильность применения стилей от данных директив
            // должна зависеть от порядка их объявления в теге
            if (element.dirs.style.order < element.dirs.show.order) {
                common.extend(
                    styles,
                    compilers.compileDirectiveStyle(vm, element),
                    compilers.compileDirectiveShow(vm, element, originalStyle)
                );
                
            } else {
                common.extend(
                    styles,
                    compilers.compileDirectiveShow(vm, element, originalStyle),
                    compilers.compileDirectiveStyle(vm, element)
                );
            }

        // v-style
        } else if (element.dirs.style) {
            styles = compilers.compileDirectiveStyle(vm, element);

        // v-show
        } else if (element.dirs.show) {
            styles = compilers.compileDirectiveShow(vm, element, originalStyle);
        }

        if ( _.size(styles) ) {
            if (originalStyle) {
                element.attribs.style = cssParser.stringify(common.extend(originalStyle, styles));
            } else {
                element.attribs.style = cssParser.stringify(styles);
            }
        }
    },


    // v-model
    compileDirectiveModel: function(vm, element) {
        var selectOptions;
        var vModelValue;
        var attrValue;
        var selectValueMap;
        var selectStaticOption;


        attrValue = common.execute(vm, element.attribs.value);

        // Если у тега был задан value, то он пересиливает значение из v-model
        // поэтому прерываем выполнение кода выставляющего value через v-model
        if (attrValue && element.attribs.type == 'text') {
            return;
        }

        vModelValue = common.execute(vm, {
            value: element.dirs.model.value.get,
            filters: element.dirs.model.value.filters,
            isEscape: false,
            isClean: false
        });

        if (element.name === 'input') {

            if (element.attribs.type === 'text' || !element.attribs.type) {
                element.attribs.value = common.cleanValue(vModelValue);
            }

            if (element.attribs.type === 'checkbox' && vModelValue) {
                element.attribs.checked = 'checked';
            }

            if (element.attribs.type === 'radio') {
                if (attrValue == vModelValue) {
                    element.attribs.checked = 'checked';
                } else {
                   delete element.attribs.checked;
                }
            }
        }

        if (element.name === 'select') {
            selectValueMap = {};

            if (element.dirs.model.options.options) {
                selectOptions = common.execute(vm, {
                    value: element.dirs.model.options.options.get,
                    filters: element.dirs.model.options.options.filters,
                    isEscape: false,
                    isClean: false
                });

                // Запоминаем первый статичный элемент, есть он есть
                if (element.inner[0] && element.inner[0].name === 'option') {
                    selectStaticOption = element.inner[0];
                }

                // Перетираем любое внутренее содержимое тега <select>
                element.inner = [];

                // Вставляем первый статичный элемент обратно
                if (selectStaticOption) {
                    element.inner.push(selectStaticOption);
                }

                if (selectOptions) {
                    for (var i = 0, l = selectOptions.length; i < l; i++) {
                        var optionItem = {
                            type: 'tag',
                            name: 'option',
                            dirs: {},
                            attribs: {
                                'value': selectOptions[i].value
                            }
                        };

                        compilers.setInnerText(optionItem, selectOptions[i].text);
                        element.inner.push(optionItem);
                    }
                }
            }


            // Значения select multiple приходят в виде массива
            // Создаём карту значений, чтобы не бегать по массиву 100500 раз
            if (element.attribs.multiple !== undefined) {
                if (vModelValue) {
                    for (var i = 0, l = vModelValue.length; i < l; i++) {
                        selectValueMap[vModelValue[i]] = true;
                    }
                }

            // Селект с единственным выбранным значение (не multiple)
            } else {
                selectValueMap[vModelValue] = true;
            }

            for (var i = 0, l = element.inner.length; i < l; i++) {
                var item = element.inner[i];

                if (item.name === 'option') {
                    item.dirs.setSelected = {
                        value: selectValueMap
                    };
                    if (selectValueMap[common.getValue(vm, item.attribs.value)]) {
                        item.attribs.selected = "selected";
                    } else {
                        // На всякий случай, чтобы удалить нежелательные selected,
                        // которые могли быть в разметке
                        delete item.attribs.selected;
                    }
                }
            }
        }

        if (element.name === 'textarea') {
            compilers.setInnerText(element, vModelValue);
        }
    },


    // v-style
    compileDirectiveStyle: function(vm, element) {
        var styleObject = {};

        if ( Array.isArray(element.dirs.style.value) ) {
            element.dirs.style.value.forEach(function (item) {
                styleObject[item.arg] = common.getValue(vm, item.get);
            });
        } else {
            styleObject = common.getValue(vm, element.dirs.style.value.get);
        }

        return styleObject;
    },


    // v-show
    compileDirectiveShow: function(vm, element, originalStyle) {
        var elStyles = {};
        var isToShow = common.getValue(vm, element.dirs.show.value.get);
        if (isToShow && originalStyle && originalStyle.display === 'none') {    
            elStyles.display = '';
        }

        if (!isToShow) {    
            elStyles.display = 'none';
        }

        return elStyles;
    }
};


module.exports = compilers;