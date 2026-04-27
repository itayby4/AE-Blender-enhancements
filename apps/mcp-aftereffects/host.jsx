// PipeFX MCP — ExtendScript host script.
//
// Loaded by CEP at panel boot via the manifest's <ScriptPath>. Defines
// every AE-side tool implementation and a single dispatch entry point
// that the TS panel calls via CSInterface.evalScript().
//
// Wire format (matches src/cep/eval-bridge.ts):
//   __pipefxDispatch(toolName, argsJson) -> JSON string of either
//     { "ok": true,  "result": <unknown> }
//     { "ok": false, "error": { "name": "...", "message": "..." } }
//
// Every dispatch is wrapped in an AE undo group so the user can Cmd+Z a
// tool call as a single atomic operation.

// ---------------------------------------------------------------------------
// JSON polyfill (older ExtendScript engines don't ship one)
// ---------------------------------------------------------------------------
if (typeof JSON === 'undefined') {
    JSON = {};
    JSON.stringify = function (obj) {
        var t = typeof obj;
        if (t !== 'object' || obj === null) {
            if (t === 'string') return '"' + obj.replace(/"/g, '\\"') + '"';
            return String(obj);
        }
        var json = [], arr = (obj && obj.constructor === Array);
        for (var n in obj) {
            var v = obj[n], jt = typeof v;
            if (jt === 'string') v = '"' + v.replace(/"/g, '\\"') + '"';
            else if (jt === 'object' && v !== null) v = JSON.stringify(v);
            json.push((arr ? '' : '"' + n + '":') + String(v));
        }
        return (arr ? '[' : '{') + String(json) + (arr ? ']' : '}');
    };
    JSON.parse = function (s) { return eval('(' + s + ')'); };
}

// `logToPanel` is referenced by some tool bodies copied from the legacy
// bridge. Keep it as a silent no-op so we don't have to scrub call sites.
function logToPanel(_msg) { /* no-op */ }

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function createComposition(args) {
    var name = args.name || "New Composition";
    var width = parseInt(args.width) || 1920;
    var height = parseInt(args.height) || 1080;
    var pixelAspect = parseFloat(args.pixelAspect) || 1.0;
    var duration = parseFloat(args.duration) || 10.0;
    var frameRate = parseFloat(args.frameRate) || 30.0;
    var bgColor = args.backgroundColor
        ? [args.backgroundColor.r / 255, args.backgroundColor.g / 255, args.backgroundColor.b / 255]
        : [0, 0, 0];
    var newComp = app.project.items.addComp(name, width, height, pixelAspect, duration, frameRate);
    if (args.backgroundColor) newComp.bgColor = bgColor;
    return {
        status: "success",
        message: "Composition created successfully",
        composition: {
            name: newComp.name, id: newComp.id, width: newComp.width, height: newComp.height,
            pixelAspect: newComp.pixelAspect, duration: newComp.duration, frameRate: newComp.frameRate,
            bgColor: newComp.bgColor
        }
    };
}

function findCompByName(compName) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem && item.name === compName) return item;
    }
    return null;
}

function resolveComp(compName) {
    var comp = compName ? findCompByName(compName) : null;
    if (!comp) {
        if (app.project.activeItem instanceof CompItem) comp = app.project.activeItem;
        else throw new Error("No composition found with name '" + (compName || '') + "' and no active composition");
    }
    return comp;
}

function resolveLayer(comp, layerIndex, layerName) {
    var layer = null;
    if (layerIndex !== undefined && layerIndex !== null) {
        if (layerIndex > 0 && layerIndex <= comp.numLayers) layer = comp.layer(layerIndex);
        else throw new Error("Layer index out of bounds: " + layerIndex);
    } else if (layerName) {
        for (var j = 1; j <= comp.numLayers; j++) {
            if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
        }
    }
    if (!layer) throw new Error("Layer not found: " + (layerName || "index " + layerIndex));
    return layer;
}

function createTextLayer(args) {
    var comp = resolveComp(args.compName);
    var text = args.text || "Text Layer";
    var position = args.position || [comp.width / 2, comp.height / 2];
    var fontSize = args.fontSize || 72;
    var color = args.color || [1, 1, 1];
    var startTime = args.startTime || 0;
    var duration = args.duration !== undefined ? args.duration : 5;
    var fontFamily = args.fontFamily || "Arial";
    var alignment = args.alignment || "center";
    var textLayer = comp.layers.addText(text);
    var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
    var textDocument = textProp.value;
    textDocument.fontSize = fontSize;
    textDocument.fillColor = color;
    textDocument.font = fontFamily;
    if (alignment === "left") textDocument.justification = ParagraphJustification.LEFT_JUSTIFY;
    else if (alignment === "right") textDocument.justification = ParagraphJustification.RIGHT_JUSTIFY;
    else textDocument.justification = ParagraphJustification.CENTER_JUSTIFY;
    textProp.setValue(textDocument);
    textLayer.property("Position").setValue(position);
    textLayer.startTime = startTime;
    if (duration > 0) textLayer.outPoint = startTime + duration;
    return {
        status: "success",
        message: "Text layer created successfully",
        layer: {
            name: textLayer.name, index: textLayer.index, type: "text",
            inPoint: textLayer.inPoint, outPoint: textLayer.outPoint,
            position: textLayer.property("Position").value
        }
    };
}

function createShapeLayer(args) {
    var comp = resolveComp(args.compName);
    var shapeType = args.shapeType || "rectangle";
    var position = args.position || [comp.width / 2, comp.height / 2];
    var size = args.size || [200, 200];
    var fillColor = args.fillColor || [1, 0, 0];
    var strokeColor = args.strokeColor || [0, 0, 0];
    var strokeWidth = args.strokeWidth || 0;
    var startTime = args.startTime || 0;
    var duration = args.duration !== undefined ? args.duration : 5;
    var name = args.name || "Shape Layer";
    var points = args.points || 5;

    var shapeLayer = comp.layers.addShape();
    shapeLayer.name = name;
    var contents = shapeLayer.property("Contents");
    var shapeGroup = contents.addProperty("ADBE Vector Group");
    var groupContents = shapeGroup.property("Contents");
    var shapePathProperty;
    if (shapeType === "rectangle") {
        shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Rect");
        shapePathProperty.property("Size").setValue(size);
    } else if (shapeType === "ellipse") {
        shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Ellipse");
        shapePathProperty.property("Size").setValue(size);
    } else if (shapeType === "polygon" || shapeType === "star") {
        shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Star");
        shapePathProperty.property("Type").setValue(shapeType === "polygon" ? 1 : 2);
        shapePathProperty.property("Points").setValue(points);
        shapePathProperty.property("Outer Radius").setValue(size[0] / 2);
        if (shapeType === "star") shapePathProperty.property("Inner Radius").setValue(size[0] / 3);
    }
    var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
    fill.property("Color").setValue(fillColor);
    fill.property("Opacity").setValue(100);
    if (strokeWidth > 0) {
        var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("Color").setValue(strokeColor);
        stroke.property("Stroke Width").setValue(strokeWidth);
        stroke.property("Opacity").setValue(100);
    }
    shapeLayer.property("Position").setValue(position);
    shapeLayer.startTime = startTime;
    if (duration > 0) shapeLayer.outPoint = startTime + duration;
    return {
        status: "success",
        message: "Shape layer created successfully",
        layer: {
            name: shapeLayer.name, index: shapeLayer.index, type: "shape", shapeType: shapeType,
            inPoint: shapeLayer.inPoint, outPoint: shapeLayer.outPoint,
            position: shapeLayer.property("Position").value
        }
    };
}

function createSolidLayer(args) {
    var comp = resolveComp(args.compName);
    var color = args.color || [1, 1, 1];
    var name = args.name || "Solid Layer";
    var position = args.position || [comp.width / 2, comp.height / 2];
    var size = args.size || [comp.width, comp.height];
    var startTime = args.startTime || 0;
    var duration = args.duration !== undefined ? args.duration : 5;
    var isAdjustment = args.isAdjustment || false;
    var solidLayer;
    if (isAdjustment) {
        solidLayer = comp.layers.addSolid([0, 0, 0], name, size[0], size[1], 1);
        solidLayer.adjustmentLayer = true;
    } else {
        solidLayer = comp.layers.addSolid(color, name, size[0], size[1], 1);
    }
    solidLayer.property("Position").setValue(position);
    solidLayer.startTime = startTime;
    if (duration > 0) solidLayer.outPoint = startTime + duration;
    return {
        status: "success",
        message: isAdjustment ? "Adjustment layer created successfully" : "Solid layer created successfully",
        layer: {
            name: solidLayer.name, index: solidLayer.index, type: isAdjustment ? "adjustment" : "solid",
            inPoint: solidLayer.inPoint, outPoint: solidLayer.outPoint,
            position: solidLayer.property("Position").value, isAdjustment: solidLayer.adjustmentLayer
        }
    };
}

function createCamera(args) {
    var comp = resolveComp(args.compName);
    var name = args.name || "Camera";
    var zoom = args.zoom || 1777.78;
    var oneNode = args.oneNode || false;
    var centerPoint = [comp.width / 2, comp.height / 2];
    var cameraLayer = comp.layers.addCamera(name, centerPoint);
    cameraLayer.property("Camera Options").property("Zoom").setValue(zoom);
    if (oneNode) cameraLayer.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
    if (args.position) cameraLayer.property("Position").setValue(args.position);
    if (!oneNode && args.pointOfInterest) {
        cameraLayer.property("Point of Interest").setValue(args.pointOfInterest);
    }
    var result = {
        name: cameraLayer.name, index: cameraLayer.index,
        zoom: cameraLayer.property("Camera Options").property("Zoom").value,
        position: cameraLayer.property("Position").value, oneNode: oneNode
    };
    if (!oneNode) result.pointOfInterest = cameraLayer.property("Point of Interest").value;
    return { status: "success", message: "Camera created successfully", layer: result };
}

function duplicateLayer(args) {
    var comp = resolveComp(args.compName);
    var layer = resolveLayer(comp, args.layerIndex, args.layerName);
    var newLayer = layer.duplicate();
    if (args.newName) newLayer.name = args.newName;
    return {
        status: "success",
        message: "Layer duplicated successfully",
        original: { name: layer.name, index: layer.index },
        duplicate: { name: newLayer.name, index: newLayer.index }
    };
}

function deleteLayer(args) {
    var comp = resolveComp(args.compName);
    var layer = resolveLayer(comp, args.layerIndex, args.layerName);
    var deleted = { name: layer.name, index: layer.index };
    layer.remove();
    return { status: "success", message: "Layer deleted successfully", deleted: deleted };
}

function setLayerMask(args) {
    var comp = resolveComp(args.compName);
    var layer = resolveLayer(comp, args.layerIndex, args.layerName);

    var shapePoints = [];
    if (args.maskRect) {
        var t = args.maskRect.top || 0, l = args.maskRect.left || 0;
        var w = args.maskRect.width || comp.width, h = args.maskRect.height || comp.height;
        shapePoints = [[l, t], [l + w, t], [l + w, t + h], [l, t + h]];
    } else if (args.maskPath && args.maskPath.length >= 3) {
        shapePoints = args.maskPath;
    } else {
        throw new Error("Must provide either maskRect or maskPath with at least 3 points");
    }
    var myShape = new Shape();
    myShape.vertices = shapePoints;
    myShape.closed = true;

    var mask, changed = [];
    if (args.maskIndex !== undefined && args.maskIndex !== null) {
        var maskGroup = layer.property("Masks");
        if (args.maskIndex > 0 && args.maskIndex <= maskGroup.numProperties) {
            mask = maskGroup.property(args.maskIndex);
        } else throw new Error("Mask index out of bounds: " + args.maskIndex);
        mask.property("Mask Path").setValue(myShape);
        changed.push("maskPath");
    } else {
        mask = layer.property("Masks").addProperty("Mask");
        mask.property("Mask Path").setValue(myShape);
        changed.push("newMask");
    }

    var maskMode = args.maskMode || "add";
    var modes = {
        none: MaskMode.NONE, add: MaskMode.ADD, subtract: MaskMode.SUBTRACT,
        intersect: MaskMode.INTERSECT, lighten: MaskMode.LIGHTEN,
        darken: MaskMode.DARKEN, difference: MaskMode.DIFFERENCE
    };
    if (modes[maskMode] !== undefined) { mask.maskMode = modes[maskMode]; changed.push("maskMode"); }
    if (args.maskFeather) { mask.property("Mask Feather").setValue(args.maskFeather); changed.push("maskFeather"); }
    if (args.maskOpacity !== undefined && args.maskOpacity !== null) {
        mask.property("Mask Opacity").setValue(args.maskOpacity); changed.push("maskOpacity");
    }
    if (args.maskExpansion !== undefined && args.maskExpansion !== null) {
        mask.property("Mask Expansion").setValue(args.maskExpansion); changed.push("maskExpansion");
    }
    if (args.maskName) { mask.name = args.maskName; changed.push("maskName"); }

    return {
        status: "success",
        message: "Mask set successfully",
        layer: { name: layer.name, index: layer.index },
        mask: { name: mask.name, index: mask.propertyIndex, mode: maskMode, changedProperties: changed }
    };
}

function setLayerProperties(args) {
    var comp = resolveComp(args.compName);
    var layer = resolveLayer(comp, args.layerIndex, args.layerName);
    var changedProperties = [];
    var textDocument = null;

    // Text-specific updates (only if layer is a TextLayer)
    if (layer instanceof TextLayer && (
        args.text !== undefined || args.fontFamily !== undefined ||
        args.fontSize !== undefined || args.fillColor !== undefined
    )) {
        var sourceTextProp = layer.property("Source Text");
        if (sourceTextProp && sourceTextProp.value) {
            var doc = sourceTextProp.value;
            var updated = false;
            if (args.text !== undefined && args.text !== null && doc.text !== args.text) {
                doc.text = args.text; changedProperties.push("text"); updated = true;
            }
            if (args.fontFamily !== undefined && args.fontFamily !== null && doc.font !== args.fontFamily) {
                doc.font = args.fontFamily; changedProperties.push("fontFamily"); updated = true;
            }
            if (args.fontSize !== undefined && args.fontSize !== null && doc.fontSize !== args.fontSize) {
                doc.fontSize = args.fontSize; changedProperties.push("fontSize"); updated = true;
            }
            if (args.fillColor !== undefined && args.fillColor !== null) {
                doc.fillColor = args.fillColor; changedProperties.push("fillColor"); updated = true;
            }
            if (updated) sourceTextProp.setValue(doc);
            textDocument = doc;
        }
    }

    if (args.enabled !== undefined && args.enabled !== null) {
        layer.enabled = !!args.enabled; changedProperties.push("enabled");
    }

    if (args.blendMode) {
        var modes = {
            normal: BlendingMode.NORMAL, add: BlendingMode.ADD, multiply: BlendingMode.MULTIPLY,
            screen: BlendingMode.SCREEN, overlay: BlendingMode.OVERLAY, softLight: BlendingMode.SOFT_LIGHT,
            hardLight: BlendingMode.HARD_LIGHT, colorDodge: BlendingMode.COLOR_DODGE, colorBurn: BlendingMode.COLOR_BURN,
            darken: BlendingMode.DARKEN, lighten: BlendingMode.LIGHTEN, difference: BlendingMode.DIFFERENCE,
            exclusion: BlendingMode.EXCLUSION
        };
        if (modes[args.blendMode] !== undefined) {
            layer.blendingMode = modes[args.blendMode]; changedProperties.push("blendMode");
        }
    }

    if (args.threeDLayer !== undefined && args.threeDLayer !== null) {
        layer.threeDLayer = !!args.threeDLayer; changedProperties.push("threeDLayer");
    }
    if (args.position) {
        var posProp = layer.property("Position");
        while (posProp.numKeys > 0) posProp.removeKey(1);
        posProp.setValue(args.position); changedProperties.push("position");
    }
    if (args.scale) { layer.property("Scale").setValue(args.scale); changedProperties.push("scale"); }
    if (args.rotation !== undefined && args.rotation !== null) {
        if (layer.threeDLayer) layer.property("Z Rotation").setValue(args.rotation);
        else layer.property("Rotation").setValue(args.rotation);
        changedProperties.push("rotation");
    }
    if (args.opacity !== undefined && args.opacity !== null) {
        layer.property("Opacity").setValue(args.opacity); changedProperties.push("opacity");
    }
    if (args.startTime !== undefined && args.startTime !== null) {
        layer.startTime = args.startTime; changedProperties.push("startTime");
    }
    if (args.duration !== undefined && args.duration !== null && args.duration > 0) {
        var startBase = (args.startTime !== undefined && args.startTime !== null) ? args.startTime : layer.startTime;
        layer.outPoint = startBase + args.duration; changedProperties.push("duration");
    }

    var info = {
        name: layer.name, index: layer.index, threeDLayer: layer.threeDLayer,
        position: layer.property("Position").value, scale: layer.property("Scale").value,
        rotation: layer.threeDLayer ? layer.property("Z Rotation").value : layer.property("Rotation").value,
        opacity: layer.property("Opacity").value,
        inPoint: layer.inPoint, outPoint: layer.outPoint, changedProperties: changedProperties
    };
    if (layer instanceof TextLayer && textDocument) {
        info.text = textDocument.text; info.fontFamily = textDocument.font;
        info.fontSize = textDocument.fontSize; info.fillColor = textDocument.fillColor;
    }
    return { status: "success", message: "Layer properties updated successfully", layer: info };
}

function batchSetLayerProperties(args) {
    if (!args.operations || !args.operations.length) {
        throw new Error("No operations provided. Pass an array of {layerIndex, ...properties}");
    }
    var comp = resolveComp(args.compName);
    var results = [];
    for (var o = 0; o < args.operations.length; o++) {
        var op = args.operations[o];
        var layer;
        try {
            layer = resolveLayer(comp, op.layerIndex, op.layerName);
        } catch (e) {
            results.push({ layerIndex: op.layerIndex, layerName: op.layerName, status: "error", message: e.toString() });
            continue;
        }
        var changed = [];
        if (op.threeDLayer !== undefined && op.threeDLayer !== null) {
            layer.threeDLayer = !!op.threeDLayer; changed.push("threeDLayer");
        }
        if (op.position) {
            var posProp = layer.property("Position");
            while (posProp.numKeys > 0) posProp.removeKey(1);
            posProp.setValue(op.position); changed.push("position");
        }
        if (op.scale) { layer.property("Scale").setValue(op.scale); changed.push("scale"); }
        if (op.rotation !== undefined && op.rotation !== null) {
            if (layer.threeDLayer) layer.property("Z Rotation").setValue(op.rotation);
            else layer.property("Rotation").setValue(op.rotation);
            changed.push("rotation");
        }
        if (op.opacity !== undefined && op.opacity !== null) {
            layer.property("Opacity").setValue(op.opacity); changed.push("opacity");
        }
        if (op.blendMode) {
            var bModes = {
                normal: BlendingMode.NORMAL, add: BlendingMode.ADD, multiply: BlendingMode.MULTIPLY,
                screen: BlendingMode.SCREEN, overlay: BlendingMode.OVERLAY,
                softLight: BlendingMode.SOFT_LIGHT, hardLight: BlendingMode.HARD_LIGHT,
                darken: BlendingMode.DARKEN, lighten: BlendingMode.LIGHTEN, difference: BlendingMode.DIFFERENCE
            };
            if (bModes[op.blendMode] !== undefined) {
                layer.blendingMode = bModes[op.blendMode]; changed.push("blendMode");
            }
        }
        if (op.startTime !== undefined && op.startTime !== null) {
            layer.startTime = op.startTime; changed.push("startTime");
        }
        if (op.outPoint !== undefined && op.outPoint !== null) {
            layer.outPoint = op.outPoint; changed.push("outPoint");
        }
        results.push({
            layerIndex: layer.index, name: layer.name, status: "success",
            threeDLayer: layer.threeDLayer, position: layer.property("Position").value,
            changedProperties: changed
        });
    }
    return { status: "success", results: results };
}

function setCompositionProperties(args) {
    var comp = resolveComp(args.compName);
    var changed = [];
    if (args.duration !== undefined && args.duration !== null) {
        comp.duration = args.duration; changed.push("duration");
    }
    if (args.frameRate !== undefined && args.frameRate !== null) {
        comp.frameRate = args.frameRate; changed.push("frameRate");
    }
    if (args.width !== undefined && args.width !== null && args.height !== undefined && args.height !== null) {
        comp.width = args.width; comp.height = args.height; changed.push("dimensions");
    }
    return {
        status: "success",
        composition: { name: comp.name, duration: comp.duration, frameRate: comp.frameRate, width: comp.width, height: comp.height },
        changedProperties: changed
    };
}

function setLayerKeyframe(args) {
    var compIndex = args.compIndex;
    var compName = args.compName;
    var layerIndex = args.layerIndex;
    var layerName = args.layerName;
    var propertyName = args.propertyName;
    var timeInSeconds = args.timeInSeconds;
    var value = args.value;

    var comp = compName ? resolveComp(compName) : null;
    if (!comp && compIndex) comp = app.project.item(compIndex);
    if (!comp || !(comp instanceof CompItem)) {
        if (app.project.activeItem instanceof CompItem) comp = app.project.activeItem;
        else throw new Error("Composition not found (compName=" + compName + ", compIndex=" + compIndex + ")");
    }
    var layer = resolveLayer(comp, layerIndex, layerName);

    var transformGroup = layer.property("Transform");
    var property = transformGroup ? transformGroup.property(propertyName) : null;
    if (!property) {
        if (layer.property("Effects") && layer.property("Effects").property(propertyName))
            property = layer.property("Effects").property(propertyName);
        else if (layer.property("Text") && layer.property("Text").property(propertyName))
            property = layer.property("Text").property(propertyName);
    }
    if (!property) throw new Error("Property '" + propertyName + "' not found on layer '" + layer.name + "'");
    if (!property.canVaryOverTime) throw new Error("Property '" + propertyName + "' cannot be keyframed");
    if (property.numKeys === 0 && !property.isTimeVarying) {
        property.setValueAtTime(comp.time, property.value);
    }
    property.setValueAtTime(timeInSeconds, value);
    return {
        status: "success",
        message: "Keyframe set for '" + propertyName + "' on layer '" + layer.name + "' at " + timeInSeconds + "s"
    };
}

function setLayerExpression(args) {
    var compIndex = args.compIndex;
    var compName = args.compName;
    var layerIndex = args.layerIndex;
    var layerName = args.layerName;
    var propertyName = args.propertyName;
    var expressionString = args.expressionString;

    var comp = compName ? resolveComp(compName) : null;
    if (!comp && compIndex) comp = app.project.item(compIndex);
    if (!comp || !(comp instanceof CompItem)) {
        if (app.project.activeItem instanceof CompItem) comp = app.project.activeItem;
        else throw new Error("Composition not found");
    }
    var layer = resolveLayer(comp, layerIndex, layerName);

    var transformGroup = layer.property("Transform");
    var property = transformGroup ? transformGroup.property(propertyName) : null;
    if (!property) {
        if (layer.property("Effects") && layer.property("Effects").property(propertyName))
            property = layer.property("Effects").property(propertyName);
        else if (layer.property("Text") && layer.property("Text").property(propertyName))
            property = layer.property("Text").property(propertyName);
    }
    if (!property) throw new Error("Property '" + propertyName + "' not found on layer '" + layer.name + "'");
    if (!property.canSetExpression) throw new Error("Property '" + propertyName + "' does not support expressions");
    property.expression = expressionString;
    return {
        status: "success",
        message: "Expression " + (expressionString === "" ? "removed" : "set") + " for '" + propertyName + "' on '" + layer.name + "'"
    };
}

function applyEffectSettings(effect, settings) {
    if (!settings) return;
    for (var propName in settings) {
        if (!settings.hasOwnProperty(propName)) continue;
        try {
            var property = null;
            try { property = effect.property(propName); }
            catch (e) {
                for (var i = 1; i <= effect.numProperties; i++) {
                    var prop = effect.property(i);
                    if (prop.name === propName) { property = prop; break; }
                }
            }
            if (property && property.setValue) property.setValue(settings[propName]);
        } catch (e) { /* skip unknown setting */ }
    }
}

function applyEffect(args) {
    var compIndex = args.compIndex || 1;
    var layerIndex = args.layerIndex || 1;
    var effectName = args.effectName;
    var effectMatchName = args.effectMatchName;
    var presetPath = args.presetPath;
    var effectSettings = args.effectSettings || {};

    if (!effectName && !effectMatchName && !presetPath) {
        throw new Error("Specify effectName, effectMatchName, or presetPath");
    }
    var comp = (args.compName ? findCompByName(args.compName) : app.project.item(compIndex));
    if (!comp || !(comp instanceof CompItem)) throw new Error("Composition not found");
    var layer = comp.layer(layerIndex);
    if (!layer) throw new Error("Layer not found at index " + layerIndex);

    var effectResult;
    if (presetPath) {
        var presetFile = new File(presetPath);
        if (!presetFile.exists) throw new Error("Effect preset file not found: " + presetPath);
        layer.applyPreset(presetFile);
        var presetBaseName = presetPath;
        var lastSep = Math.max(presetBaseName.lastIndexOf("/"), presetBaseName.lastIndexOf("\\"));
        if (lastSep >= 0) presetBaseName = presetBaseName.substr(lastSep + 1);
        effectResult = { type: "preset", name: presetBaseName, applied: true };
    } else {
        var matchOrName = effectMatchName || effectName;
        var effect = layer.Effects.addProperty(matchOrName);
        effectResult = { type: "effect", name: effect.name, matchName: effect.matchName, index: effect.propertyIndex };
        applyEffectSettings(effect, effectSettings);
    }
    return {
        status: "success",
        message: "Effect applied successfully",
        effect: effectResult,
        layer: { name: layer.name, index: layerIndex },
        composition: { name: comp.name, index: compIndex }
    };
}

function applyEffectTemplate(args) {
    var compIndex = args.compIndex || 1;
    var layerIndex = args.layerIndex || 1;
    var templateName = args.templateName;
    var customSettings = args.customSettings || {};
    if (!templateName) throw new Error("Specify a templateName");

    var comp = (args.compName ? findCompByName(args.compName) : app.project.item(compIndex));
    if (!comp || !(comp instanceof CompItem)) throw new Error("Composition not found");
    var layer = comp.layer(layerIndex);
    if (!layer) throw new Error("Layer not found at index " + layerIndex);

    var templates = {
        "gaussian-blur": { effectMatchName: "ADBE Gaussian Blur 2", settings: { Blurriness: customSettings.blurriness || 20 } },
        "directional-blur": {
            effectMatchName: "ADBE Directional Blur",
            settings: { Direction: customSettings.direction || 0, "Blur Length": customSettings.length || 10 }
        },
        "color-balance": {
            effectMatchName: "ADBE Color Balance (HLS)",
            settings: { Hue: customSettings.hue || 0, Lightness: customSettings.lightness || 0, Saturation: customSettings.saturation || 0 }
        },
        "brightness-contrast": {
            effectMatchName: "ADBE Brightness & Contrast 2",
            settings: { Brightness: customSettings.brightness || 0, Contrast: customSettings.contrast || 0, "Use Legacy": false }
        },
        "curves": { effectMatchName: "ADBE CurvesCustom" },
        "glow": {
            effectMatchName: "ADBE Glow",
            settings: { "Glow Threshold": customSettings.threshold || 50, "Glow Radius": customSettings.radius || 15, "Glow Intensity": customSettings.intensity || 1 }
        },
        "drop-shadow": {
            effectMatchName: "ADBE Drop Shadow",
            settings: {
                "Shadow Color": customSettings.color || [0, 0, 0, 1],
                Opacity: customSettings.opacity || 50, Direction: customSettings.direction || 135,
                Distance: customSettings.distance || 10, Softness: customSettings.softness || 10
            }
        },
        "cinematic-look": {
            effects: [
                { effectMatchName: "ADBE CurvesCustom", settings: {} },
                { effectMatchName: "ADBE Vibrance", settings: { Vibrance: 15, Saturation: -5 } }
            ]
        },
        "text-pop": {
            effects: [
                { effectMatchName: "ADBE Drop Shadow", settings: { "Shadow Color": [0, 0, 0, 1], Opacity: 75, Distance: 5, Softness: 10 } },
                { effectMatchName: "ADBE Glow", settings: { "Glow Threshold": 50, "Glow Radius": 10, "Glow Intensity": 1.5 } }
            ]
        }
    };
    var template = templates[templateName];
    if (!template) {
        var avail = []; for (var k in templates) avail.push(k);
        throw new Error("Template '" + templateName + "' not found. Available: " + avail.join(", "));
    }

    var appliedEffects = [];
    if (template.effectMatchName) {
        var fx = layer.Effects.addProperty(template.effectMatchName);
        applyEffectSettings(fx, template.settings || {});
        appliedEffects.push({ name: fx.name, matchName: fx.matchName });
    } else if (template.effects) {
        for (var i = 0; i < template.effects.length; i++) {
            var step = template.effects[i];
            var fx2 = layer.Effects.addProperty(step.effectMatchName);
            applyEffectSettings(fx2, step.settings || {});
            appliedEffects.push({ name: fx2.name, matchName: fx2.matchName });
        }
    }
    return {
        status: "success",
        message: "Effect template '" + templateName + "' applied successfully",
        appliedEffects: appliedEffects,
        layer: { name: layer.name, index: layerIndex },
        composition: { name: comp.name, index: compIndex }
    };
}

function getProjectInfo() {
    var project = app.project;
    var counts = { compositions: 0, footage: 0, folders: 0, solids: 0 };
    var items = [];
    var limit = Math.min(project.numItems, 100);
    for (var i = 1; i <= limit; i++) {
        var item = project.item(i);
        var type = "Other";
        if (item instanceof CompItem) { type = "Composition"; counts.compositions++; }
        else if (item instanceof FolderItem) { type = "Folder"; counts.folders++; }
        else if (item instanceof FootageItem) {
            if (item.mainSource instanceof SolidSource) { type = "Solid"; counts.solids++; }
            else { type = "Footage"; counts.footage++; }
        }
        items.push({ id: item.id, name: item.name, type: type });
    }
    var result = {
        projectName: project.file ? project.file.name : "Untitled Project",
        path: project.file ? project.file.fsName : "",
        numItems: project.numItems,
        bitsPerChannel: project.bitsPerChannel,
        items: items,
        itemCounts: counts
    };
    if (app.project.activeItem instanceof CompItem) {
        var ac = app.project.activeItem;
        result.activeComp = {
            id: ac.id, name: ac.name, width: ac.width, height: ac.height,
            duration: ac.duration, frameRate: ac.frameRate, numLayers: ac.numLayers
        };
    }
    return result;
}

function listCompositions() {
    var project = app.project;
    var compositions = [];
    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);
        if (item instanceof CompItem) {
            compositions.push({
                id: item.id, name: item.name, duration: item.duration, frameRate: item.frameRate,
                width: item.width, height: item.height, numLayers: item.numLayers
            });
        }
    }
    return { compositions: compositions };
}

function getLayerInfo(args) {
    args = args || {};
    var compName = args.compositionName || args.compName || null;
    var targets = [];
    if (compName) {
        var c = findCompByName(compName);
        if (!c) throw new Error("No composition found with name '" + compName + "'");
        targets = [c];
    } else if (app.project.activeItem instanceof CompItem) {
        targets = [app.project.activeItem];
    } else {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) targets.push(item);
        }
    }
    var out = [];
    for (var t = 0; t < targets.length; t++) {
        var comp = targets[t];
        var layers = [];
        for (var li = 1; li <= comp.numLayers; li++) {
            var layer = comp.layer(li);
            var info = {
                index: layer.index, name: layer.name, enabled: layer.enabled,
                inPoint: layer.inPoint, outPoint: layer.outPoint,
                threeDLayer: layer.threeDLayer
            };
            try { info.position = layer.property("Position").value; } catch (e) { /* camera/light */ }
            try {
                var fx = layer.property("Effects");
                var effectNames = [];
                if (fx && fx.numProperties) {
                    for (var fxi = 1; fxi <= fx.numProperties; fxi++) effectNames.push(fx.property(fxi).name);
                }
                info.effects = effectNames;
            } catch (e) { /* no effects supported */ }
            layers.push(info);
        }
        out.push({ id: comp.id, name: comp.name, layers: layers });
    }
    return out;
}

function bridgeHealth() {
    return {
        verdict: "alive",
        aeVersion: app.version,
        panelVersion: "0.2.0",
        projectPath: (app.project && app.project.file) ? app.project.file.fsName : null,
        timestamp: new Date().getTime()
    };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

var TOOLS = {
    "bridge-health": bridgeHealth,
    "get-project-info": getProjectInfo,
    "list-compositions": listCompositions,
    "get-layer-info": getLayerInfo,
    "create-composition": createComposition,
    "create-text-layer": createTextLayer,
    "create-shape-layer": createShapeLayer,
    "create-solid-layer": createSolidLayer,
    "create-camera": createCamera,
    "duplicate-layer": duplicateLayer,
    "delete-layer": deleteLayer,
    "set-layer-mask": setLayerMask,
    "set-layer-properties": setLayerProperties,
    "batch-set-layer-properties": batchSetLayerProperties,
    "set-composition-properties": setCompositionProperties,
    "setLayerKeyframe": setLayerKeyframe,
    "setLayerExpression": setLayerExpression,
    "apply-effect": applyEffect,
    "apply-effect-template": applyEffectTemplate,
    "mcp_aftereffects_applyEffect": applyEffect,
    "mcp_aftereffects_applyEffectTemplate": applyEffectTemplate
};

// Tools that don't mutate state — skip the undo group so we don't pollute
// the undo stack with no-op entries.
var READ_ONLY_TOOLS = {
    "bridge-health": true,
    "get-project-info": true,
    "list-compositions": true,
    "get-layer-info": true
};

function __pipefxDispatch(toolName, argsJson) {
    var fn = TOOLS[toolName];
    if (!fn) {
        return JSON.stringify({
            ok: false,
            error: { name: "UnknownTool", message: "Unknown tool: " + toolName }
        });
    }
    var args;
    try { args = argsJson ? JSON.parse(argsJson) : {}; }
    catch (e) {
        return JSON.stringify({
            ok: false,
            error: { name: "BadArgs", message: "Failed to parse args: " + e.toString() }
        });
    }

    var inUndo = false;
    if (!READ_ONLY_TOOLS[toolName]) {
        try { app.beginUndoGroup("PipeFX: " + toolName); inUndo = true; } catch (e) { /* ignore */ }
    }

    try {
        var result = fn(args);
        return JSON.stringify({ ok: true, result: result });
    } catch (e) {
        return JSON.stringify({
            ok: false,
            error: { name: e.name || "AeError", message: e.toString() }
        });
    } finally {
        if (inUndo) { try { app.endUndoGroup(); } catch (e) { /* ignore */ } }
    }
}
