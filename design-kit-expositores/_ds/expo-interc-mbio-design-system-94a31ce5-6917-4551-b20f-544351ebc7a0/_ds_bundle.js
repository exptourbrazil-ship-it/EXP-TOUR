/* @ds-bundle: {"format":3,"namespace":"ExpoIntercMbioDesignSystem_94a31c","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"24cda681d197","components/core/Badge.jsx":"0f63c9340ebe","components/core/Button.jsx":"5a3563201b43","components/core/Card.jsx":"6d97cfe85926","components/core/Tag.jsx":"21255c6d4913","components/forms/Checkbox.jsx":"036731740077","components/forms/Input.jsx":"6522b5c70dda","components/forms/Radio.jsx":"6f43d8fac564","components/forms/Select.jsx":"c8d5acf3c84c","components/forms/Switch.jsx":"e344fa70b44e","components/navigation/Tabs.jsx":"654bbf2eb5b8","ui_kits/app/MobileApp.jsx":"16e2627a376c","ui_kits/app/ios-frame.jsx":"be3343be4b51","ui_kits/website/Chrome.jsx":"aaad8c107fa3","ui_kits/website/ExpoEvent.jsx":"3131aeb68de0","ui_kits/website/Home.jsx":"8c923694e29c","ui_kits/website/Programs.jsx":"cda086042adc","ui_kits/website/WebsiteApp.jsx":"b44f121988ed"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ExpoIntercMbioDesignSystem_94a31c = window.ExpoIntercMbioDesignSystem_94a31c || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Avatar — circular user/partner image with initials fallback.
 */
function Avatar({
  src,
  name = "",
  size = 40,
  style,
  ...rest
}) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: "var(--radius-pill)",
      overflow: "hidden",
      flex: "none",
      background: "var(--gradient-brand)",
      color: "var(--white)",
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-bold)",
      fontSize: size * 0.4,
      lineHeight: 1,
      userSelect: "none",
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials || "?");
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — small status / category label.
 * Tones map to the brand palette; `success` uses accent green.
 */
function Badge({
  tone = "neutral",
  solid = false,
  children,
  style,
  ...rest
}) {
  const tones = {
    primary: {
      fg: "var(--blue-primary)",
      bg: "var(--blue-tint)"
    },
    info: {
      fg: "var(--blue-tertiary)",
      bg: "#E8F1FF"
    },
    success: {
      fg: "#178A00",
      bg: "#E6FAE0"
    },
    neutral: {
      fg: "var(--gray-700)",
      bg: "var(--gray-100)"
    },
    onBrand: {
      fg: "var(--white)",
      bg: "rgba(255,255,255,0.18)"
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-semibold)",
      fontSize: "12px",
      lineHeight: 1,
      letterSpacing: "0.02em",
      padding: "5px 10px",
      borderRadius: "var(--radius-pill)",
      color: solid ? "var(--white)" : t.fg,
      background: solid ? t.fg : t.bg,
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — Expo Intercâmbio primary action control.
 * Variants: primary (blue), success (green CTA), secondary (outline), ghost, link.
 */
function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  type = "button",
  onClick,
  children,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      height: "36px",
      padding: "0 20px",
      fontSize: "13px"
    },
    md: {
      height: "44px",
      padding: "0 32px",
      fontSize: "14px"
    },
    lg: {
      height: "52px",
      padding: "0 40px",
      fontSize: "16px"
    }
  };
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontFamily: "var(--font-display)",
    fontWeight: variant === "success" ? "var(--fw-bold)" : "var(--fw-medium)",
    lineHeight: 1,
    border: "var(--border-width-emph) solid transparent",
    borderRadius: "var(--radius-sm)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? "100%" : "auto",
    whiteSpace: "nowrap",
    transition: "var(--transition-base)",
    ...sizes[size]
  };
  const variants = {
    primary: {
      background: "var(--action-primary)",
      color: "var(--white)",
      borderColor: "var(--action-primary)"
    },
    success: {
      background: "var(--action-success)",
      color: "var(--white)",
      borderColor: "var(--action-success)"
    },
    secondary: {
      background: "transparent",
      color: "var(--action-secondary)",
      borderColor: "var(--action-secondary)"
    },
    ghost: {
      background: "transparent",
      color: "var(--blue-primary)",
      borderColor: "transparent"
    },
    link: {
      background: "transparent",
      color: "var(--text-link)",
      borderColor: "transparent",
      padding: 0,
      height: "auto",
      textDecoration: "underline",
      textUnderlineOffset: "3px"
    }
  };
  const [hover, setHover] = React.useState(false);
  const hoverStyles = !disabled && hover ? {
    primary: {
      background: "var(--action-primary-hover)",
      borderColor: "var(--action-primary-hover)"
    },
    success: {
      background: "var(--action-success-hover)",
      borderColor: "var(--action-success-hover)"
    },
    secondary: {
      background: "var(--blue-tint)"
    },
    ghost: {
      background: "var(--blue-tint)"
    },
    link: {
      color: "var(--green-accent)"
    }
  }[variant] : {};
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...base,
      ...variants[variant],
      ...hoverStyles,
      ...style
    }
  }, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — content container. The brand program card has a 2px primary-blue top
 * accent; `accent="none"` gives a plain surface. Hover lifts subtly when interactive.
 */
function Card({
  accent = "top",
  interactive = false,
  padding = "var(--space-3)",
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const lifted = interactive && hover;
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: "var(--surface-card)",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border-subtle)",
      borderTop: accent === "top" ? "2px solid var(--border-card-accent)" : undefined,
      boxShadow: lifted ? "var(--shadow-hover)" : "var(--shadow-sm)",
      transform: lifted ? "translateY(-2px)" : "translateY(0)",
      transition: "var(--transition-base)",
      cursor: interactive ? "pointer" : "default",
      padding,
      overflow: "hidden",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Tag — removable / selectable chip. Outline by default; filled when `selected`.
 */
function Tag({
  selected = false,
  onRemove,
  onClick,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    onClick: onClick,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-medium)",
      fontSize: "13px",
      lineHeight: 1,
      padding: "7px 12px",
      borderRadius: "var(--radius-pill)",
      cursor: onClick ? "pointer" : "default",
      border: "1px solid",
      borderColor: selected ? "var(--blue-primary)" : "var(--gray-400)",
      background: selected ? "var(--blue-tint)" : "var(--white)",
      color: selected ? "var(--blue-primary)" : "var(--gray-700)",
      transition: "var(--transition-base)",
      ...style
    }
  }, rest), children, onRemove && /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onRemove(e);
    },
    "aria-label": "Remover",
    style: {
      border: "none",
      background: "none",
      cursor: "pointer",
      color: "inherit",
      fontSize: "14px",
      lineHeight: 1,
      padding: 0,
      display: "inline-flex",
      opacity: 0.7
    }
  }, "\xD7"));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Checkbox — 18px box, checked = primary-blue fill with white check. Poppins label.
 */
function Checkbox({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  id,
  style,
  ...rest
}) {
  const fieldId = id || (label ? `cb-${String(label).replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      fontFamily: "var(--font-body)",
      fontSize: "14px",
      color: "var(--ink)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      width: "18px",
      height: "18px",
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    type: "checkbox",
    checked: checked,
    defaultChecked: defaultChecked,
    onChange: onChange,
    disabled: disabled,
    style: {
      appearance: "none",
      WebkitAppearance: "none",
      margin: 0,
      width: "18px",
      height: "18px",
      border: "2px solid var(--gray-400)",
      borderRadius: "var(--radius-sm)",
      background: "var(--white)",
      cursor: "inherit",
      transition: "var(--transition-base)"
    }
  }, rest)), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "12",
    height: "12",
    fill: "none",
    stroke: "white",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }))), label && /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("style", null, `#${fieldId}:checked{background:var(--blue-primary);border-color:var(--blue-primary);}#${fieldId}:not(:checked)~svg{opacity:0;}#${fieldId}:focus-visible{box-shadow:var(--shadow-focus);}`));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — labeled text field. White bg, 1px gray border, focus = 2px primary blue.
 */
function Input({
  label,
  hint,
  error,
  id,
  type = "text",
  iconLeft = null,
  style,
  containerStyle,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const fieldId = id || (label ? `in-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const borderColor = error ? "#D14343" : focus ? "var(--blue-primary)" : "var(--border-input)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-regular)",
      fontSize: "13px",
      color: "var(--text-muted)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center"
    }
  }, iconLeft && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: "12px",
      display: "inline-flex",
      color: "var(--gray-text)",
      pointerEvents: "none"
    }
  }, iconLeft), /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    type: type,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: "100%",
      fontFamily: "var(--font-body)",
      fontSize: "14px",
      color: "var(--ink)",
      background: "var(--white)",
      border: `${focus || error ? "2px" : "1px"} solid ${borderColor}`,
      borderRadius: "var(--radius-sm)",
      padding: focus || error ? "9px 11px" : "10px 12px",
      paddingLeft: iconLeft ? "38px" : undefined,
      outline: "none",
      transition: "border-color var(--dur-micro) var(--ease-standard)",
      boxSizing: "border-box",
      ...style
    }
  }, rest))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "12px",
      color: error ? "#D14343" : "var(--text-muted)"
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Radio — 18px circle, selected = primary-blue ring with filled dot.
 */
function Radio({
  label,
  name,
  value,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  id,
  style,
  ...rest
}) {
  const fieldId = id || `rd-${name}-${value}`;
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      fontFamily: "var(--font-body)",
      fontSize: "14px",
      color: "var(--ink)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      width: "18px",
      height: "18px",
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    type: "radio",
    name: name,
    value: value,
    checked: checked,
    defaultChecked: defaultChecked,
    onChange: onChange,
    disabled: disabled,
    style: {
      appearance: "none",
      WebkitAppearance: "none",
      margin: 0,
      width: "18px",
      height: "18px",
      border: "2px solid var(--gray-400)",
      borderRadius: "var(--radius-pill)",
      background: "var(--white)",
      cursor: "inherit",
      transition: "var(--transition-base)"
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      width: "8px",
      height: "8px",
      borderRadius: "var(--radius-pill)",
      background: "var(--white)",
      pointerEvents: "none"
    },
    className: `dot-${fieldId}`
  })), label && /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("style", null, `#${fieldId}:checked{background:var(--blue-primary);border-color:var(--blue-primary);}#${fieldId}:not(:checked)~.dot-${fieldId}{opacity:0;}#${fieldId}:focus-visible{box-shadow:var(--shadow-focus);}`));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Select — native dropdown styled to match Input. Primary-blue chevron, right-aligned.
 */
function Select({
  label,
  hint,
  id,
  options = [],
  placeholder,
  style,
  containerStyle,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const fieldId = id || (label ? `sel-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const chevron = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%230044BA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>`);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "13px",
      color: "var(--text-muted)"
    }
  }, label), /*#__PURE__*/React.createElement("select", _extends({
    id: fieldId,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: "100%",
      fontFamily: "var(--font-body)",
      fontSize: "14px",
      color: "var(--ink)",
      background: `var(--white) url("${chevron}") no-repeat right 12px center`,
      border: `${focus ? "2px" : "1px"} solid ${focus ? "var(--blue-primary)" : "var(--border-input)"}`,
      borderRadius: "var(--radius-sm)",
      padding: focus ? "9px 36px 9px 11px" : "10px 36px 10px 12px",
      appearance: "none",
      WebkitAppearance: "none",
      outline: "none",
      cursor: "pointer",
      transition: "border-color var(--dur-micro) var(--ease-standard)",
      boxSizing: "border-box",
      ...style
    }
  }, rest), placeholder && /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true,
    selected: true,
    hidden: true
  }, placeholder), options.map(o => {
    const value = typeof o === "string" ? o : o.value;
    const labelText = typeof o === "string" ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: value,
      value: value
    }, labelText);
  })), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "12px",
      color: "var(--text-muted)"
    }
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Switch — on/off toggle. On = primary-blue track.
 */
function Switch({
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  label,
  id,
  style,
  ...rest
}) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(!!defaultChecked);
  const on = isControlled ? checked : internal;
  const fieldId = id || (label ? `sw-${String(label).replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const toggle = e => {
    if (disabled) return;
    if (!isControlled) setInternal(v => !v);
    onChange && onChange(!on, e);
  };
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      fontFamily: "var(--font-body)",
      fontSize: "14px",
      color: "var(--ink)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", _extends({
    id: fieldId,
    type: "button",
    role: "switch",
    "aria-checked": on,
    onClick: toggle,
    disabled: disabled,
    style: {
      position: "relative",
      width: "40px",
      height: "24px",
      flex: "none",
      borderRadius: "var(--radius-pill)",
      border: "none",
      padding: 0,
      background: on ? "var(--blue-primary)" : "var(--gray-400)",
      cursor: "inherit",
      transition: "var(--transition-base)"
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: "3px",
      left: on ? "19px" : "3px",
      width: "18px",
      height: "18px",
      borderRadius: "var(--radius-pill)",
      background: "var(--white)",
      boxShadow: "var(--shadow-xs)",
      transition: "left var(--dur-micro) var(--ease-standard)"
    }
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Tabs — underline tab bar. Active tab uses primary blue with a bottom indicator.
 * Controlled via `value`/`onChange` or uncontrolled via `defaultValue`.
 */
function Tabs({
  items = [],
  value,
  defaultValue,
  onChange,
  style,
  ...rest
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue ?? (items[0] && items[0].id));
  const active = isControlled ? value : internal;
  const select = id => {
    if (!isControlled) setInternal(id);
    onChange && onChange(id);
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: "flex",
      gap: "var(--space-4)",
      borderBottom: "1px solid var(--border-subtle)",
      ...style
    }
  }, rest), items.map(it => {
    const on = it.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      role: "tab",
      "aria-selected": on,
      onClick: () => select(it.id),
      style: {
        position: "relative",
        border: "none",
        background: "none",
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        fontWeight: on ? "var(--fw-medium)" : "var(--fw-regular)",
        fontSize: "14px",
        color: on ? "var(--blue-primary)" : "var(--gray-700)",
        padding: "12px 2px",
        transition: "var(--transition-base)"
      }
    }, it.label, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "-1px",
        height: "2px",
        background: "var(--blue-primary)",
        transform: on ? "scaleX(1)" : "scaleX(0)",
        transition: "transform var(--dur-micro) var(--ease-standard)"
      }
    }));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/MobileApp.jsx
try { (() => {
const DSm = window.ExpoIntercMbioDesignSystem_94a31c;
const APP_PHOTO_BASE = "../../assets/photos/";
function MIcon({
  name,
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  style
}) {
  const svg = window.feather && feather.icons[name] ? feather.icons[name].toSvg({
    width: size,
    height: size,
    "stroke-width": strokeWidth
  }) : "";
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      color,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: svg
    }
  });
}
function MPhoto({
  height = 160,
  icon = "image",
  src = "",
  radius = "var(--radius-lg)",
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height,
      borderRadius: radius,
      position: "relative",
      overflow: "hidden",
      background: "var(--gradient-brand)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      ...style
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: APP_PHOTO_BASE + src,
    alt: "",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : /*#__PURE__*/React.createElement(MIcon, {
    name: icon,
    size: 26,
    color: "rgba(255,255,255,.55)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "var(--overlay-brand)"
    }
  }));
}
const APP_PROGRAMS = [{
  id: 1,
  title: "Inglês geral em Dublin",
  country: "Irlanda",
  weeks: "12 semanas",
  price: "R$ 18.900",
  tag: "Vagas abertas",
  tone: "success",
  photo: "networking.jpg"
}, {
  id: 2,
  title: "Universidade em Toronto",
  country: "Canadá",
  weeks: "1 semestre",
  price: "R$ 42.500",
  tag: "Bolsa 20%",
  tone: "info",
  photo: "booth-canada.jpg"
}, {
  id: 3,
  title: "High School na Austrália",
  country: "Austrália",
  weeks: "6 meses",
  price: "R$ 56.000",
  tag: "Destaque",
  tone: "info",
  photo: "students-1.jpg"
}];

// ---- Header ----
function AppHeader({
  title,
  onBack
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 20px 14px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      borderBottom: "1px solid var(--border-subtle)",
      background: "#fff"
    }
  }, onBack ? /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      border: "none",
      background: "none",
      padding: 0,
      cursor: "pointer",
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement(MIcon, {
    name: "chevron-left",
    size: 26,
    color: "var(--blue-primary)"
  })) : /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/brand/icon-secondary.png",
    alt: "",
    style: {
      height: 30,
      display: "block"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      lineHeight: 0.95
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      fontSize: 15,
      letterSpacing: "0.05em",
      color: "var(--blue-secondary)"
    }
  }, "EXPO"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 8,
      letterSpacing: "0.1em",
      color: "var(--blue-principal)"
    }
  }, "INTERC\xC2MBIO"))), title && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 17,
      color: "var(--ink)"
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement(MIcon, {
    name: "bell",
    size: 22,
    color: "var(--gray-700)"
  })));
}

// ---- Bottom tab bar ----
function TabBar({
  tab,
  onTab
}) {
  const tabs = [["home", "Início"], ["search", "Buscar"], ["bookmark", "Salvos"], ["user", "Perfil"]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      borderTop: "1px solid var(--border-subtle)",
      background: "#fff",
      padding: "8px 0 4px"
    }
  }, tabs.map(([ic, lb]) => {
    const on = tab === ic;
    return /*#__PURE__*/React.createElement("button", {
      key: ic,
      onClick: () => onTab(ic),
      style: {
        flex: 1,
        border: "none",
        background: "none",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: "4px 0"
      }
    }, /*#__PURE__*/React.createElement(MIcon, {
      name: ic,
      size: 22,
      color: on ? "var(--blue-primary)" : "var(--gray-text)"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-body)",
        fontSize: 10.5,
        fontWeight: on ? 600 : 400,
        color: on ? "var(--blue-primary)" : "var(--gray-text)"
      }
    }, lb));
  }));
}

// ---- Discover (home) ----
function Discover({
  onOpen
}) {
  const [region, setRegion] = React.useState("Todos");
  const regions = ["Todos", "Europa", "Canadá", "Oceania"];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 20px 24px"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 26,
      lineHeight: 1.2,
      color: "var(--ink)",
      margin: "0 0 4px",
      textWrap: "balance"
    }
  }, "Ol\xE1, Mariana \uD83D\uDC4B"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 14,
      color: "var(--gray-text)",
      margin: "0 0 16px"
    }
  }, "Para onde voc\xEA quer ir?"), /*#__PURE__*/React.createElement(DSm.Input, {
    iconLeft: /*#__PURE__*/React.createElement(MIcon, {
      name: "search",
      size: 18
    }),
    placeholder: "Buscar pa\xEDs, escola ou curso",
    containerStyle: {
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 20,
      overflowX: "auto",
      paddingBottom: 4
    }
  }, regions.map(r => /*#__PURE__*/React.createElement(DSm.Tag, {
    key: r,
    selected: region === r,
    onClick: () => setRegion(r)
  }, r))), /*#__PURE__*/React.createElement(MPhoto, {
    height: 140,
    src: "crowd-hall.jpg",
    style: {
      marginBottom: 6
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      margin: "18px 0 12px"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 18,
      color: "var(--ink)",
      margin: 0
    }
  }, "Programas para voc\xEA"), /*#__PURE__*/React.createElement(DSm.Button, {
    variant: "link",
    size: "sm"
  }, "Ver todos")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, APP_PROGRAMS.map(p => /*#__PURE__*/React.createElement(DSm.Card, {
    key: p.id,
    accent: "top",
    interactive: true,
    padding: "0",
    onClick: () => onOpen(p)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 0
    }
  }, /*#__PURE__*/React.createElement(MPhoto, {
    height: 96,
    src: p.photo,
    radius: "0",
    style: {
      width: 96,
      flex: "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 14px",
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement(DSm.Badge, {
    tone: p.tone
  }, p.tag)), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 15,
      color: "var(--ink)",
      margin: "0 0 2px"
    }
  }, p.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 12,
      color: "var(--gray-text)",
      margin: "0 0 6px"
    }
  }, p.country, " \xB7 ", p.weeks), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 16,
      color: "var(--blue-primary)"
    }
  }, p.price)))))));
}

// ---- Program detail ----
function Detail({
  program,
  onBack,
  onRegister
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(MPhoto, {
    height: 200,
    src: program.photo,
    radius: "0"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 20px 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(DSm.Badge, {
    tone: program.tone
  }, program.tag), /*#__PURE__*/React.createElement(DSm.Badge, {
    tone: "neutral"
  }, program.country)), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 24,
      lineHeight: 1.25,
      color: "var(--ink)",
      margin: "0 0 8px",
      textWrap: "balance"
    }
  }, program.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 15,
      lineHeight: 1.6,
      color: "var(--gray-700)",
      margin: "0 0 18px"
    }
  }, "Programa completo com aulas, acomoda\xE7\xE3o e suporte local. Ideal para quem quer flu\xEAncia e uma experi\xEAncia cultural transformadora."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12,
      marginBottom: 22
    }
  }, [["calendar", "Duração", program.weeks], ["home", "Acomodação", "Casa de família inclusa"], ["award", "Certificação", "Diploma reconhecido internacionalmente"]].map(([ic, k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: "var(--radius-md)",
      background: "var(--blue-tint)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement(MIcon, {
    name: ic,
    size: 18,
    color: "var(--blue-primary)"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 12,
      color: "var(--gray-text)"
    }
  }, k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 14,
      color: "var(--ink)"
    }
  }, v)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 20px",
      borderTop: "1px solid var(--border-subtle)",
      background: "#fff",
      display: "flex",
      alignItems: "center",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 11,
      color: "var(--gray-text)"
    }
  }, "a partir de"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 22,
      color: "var(--blue-primary)"
    }
  }, program.price)), /*#__PURE__*/React.createElement(DSm.Button, {
    variant: "success",
    size: "lg",
    style: {
      flex: 1
    },
    onClick: onRegister
  }, "Quero me inscrever")));
}

// ---- Register success ----
function Registered({
  onHome
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "60px 28px",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      height: "100%",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 72,
      height: 72,
      borderRadius: "999px",
      background: "#E6F8E9",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(MIcon, {
    name: "check-circle",
    size: 36,
    color: "#2E8B43"
  })), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 24,
      color: "var(--ink)",
      margin: "0 0 8px"
    }
  }, "Inscri\xE7\xE3o enviada!"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 15,
      lineHeight: 1.6,
      color: "var(--gray-700)",
      margin: "0 0 28px",
      maxWidth: 260
    }
  }, "Um consultor entrar\xE1 em contato em at\xE9 24h. Enquanto isso, garanta seu ingresso para o Expo 2026."), /*#__PURE__*/React.createElement(DSm.Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    onClick: onHome
  }, "Voltar ao in\xEDcio"));
}
function MobileApp() {
  const [tab, setTab] = React.useState("home");
  const [view, setView] = React.useState({
    name: "discover"
  });
  const goHome = () => {
    setView({
      name: "discover"
    });
    setTab("home");
  };
  let screen,
    title = null,
    back = null,
    showTabs = true;
  if (view.name === "discover") {
    screen = /*#__PURE__*/React.createElement(Discover, {
      onOpen: p => setView({
        name: "detail",
        program: p
      })
    });
  } else if (view.name === "detail") {
    screen = /*#__PURE__*/React.createElement(Detail, {
      program: view.program,
      onBack: goHome,
      onRegister: () => setView({
        name: "done"
      })
    });
    title = "Programa";
    back = goHome;
    showTabs = false;
  } else {
    screen = /*#__PURE__*/React.createElement(Registered, {
      onHome: goHome
    });
    title = "Inscrição";
    back = goHome;
    showTabs = false;
  }
  return /*#__PURE__*/React.createElement(IOSDevice, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--gray-50)"
    }
  }, /*#__PURE__*/React.createElement(AppHeader, {
    title: title,
    onBack: back
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto"
    }
  }, screen), showTabs && /*#__PURE__*/React.createElement(TabBar, {
    tab: tab,
    onTab: setTab
  })));
}
Object.assign(window, {
  MobileApp
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/MobileApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ios-frame.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports (to window): IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard
//
// Usage — wrap your screen content in <IOSDevice> to get the bezel, status bar
// and home indicator (props: title, dark, keyboard):
//
//   <IOSDevice title="Settings">
//     ...your screen content...
//   </IOSDevice>
//   <IOSDevice dark title="Search" keyboard>…</IOSDevice>
/* END USAGE */

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ios-frame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Chrome.jsx
try { (() => {
// Shared website chrome: Icon helper, Wordmark, Navbar, Footer.
// Composes design-system components from the global namespace.
const DS = window.ExpoIntercMbioDesignSystem_94a31c;
function Icon({
  name,
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  style
}) {
  const svg = window.feather && feather.icons[name] ? feather.icons[name].toSvg({
    width: size,
    height: size,
    "stroke-width": strokeWidth
  }) : "";
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      color,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: svg
    }
  });
}
function Wordmark({
  size = 22,
  reversed = false
}) {
  const icon = reversed ? "icon-white.png" : "icon-secondary.png";
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.42
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/brand/" + icon,
    alt: "",
    style: {
      height: size * 1.7,
      display: "block"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      lineHeight: 0.98
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      fontSize: size,
      letterSpacing: "0.06em",
      color: reversed ? "#fff" : "var(--blue-secondary)"
    }
  }, "EXPO"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: size * 0.54,
      letterSpacing: "0.12em",
      color: reversed ? "rgba(255,255,255,.85)" : "var(--blue-principal)"
    }
  }, "INTERC\xC2MBIO")));
}
function Navbar({
  current,
  onNav
}) {
  const links = [{
    id: "home",
    label: "Início"
  }, {
    id: "programs",
    label: "Programas"
  }, {
    id: "expo",
    label: "O Expo"
  }, {
    id: "bolsas",
    label: "Bolsas"
  }];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 10,
      background: "var(--white)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      height: 72,
      padding: "0 32px",
      display: "flex",
      alignItems: "center",
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNav("home"),
    style: {
      cursor: "pointer",
      display: "flex",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: 22
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      gap: 28,
      marginLeft: 16
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l.id,
    onClick: () => onNav(l.id),
    style: {
      cursor: "pointer",
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: 14,
      color: current === l.id ? "var(--blue-primary)" : "var(--ink)",
      borderBottom: current === l.id ? "2px solid var(--blue-primary)" : "2px solid transparent",
      paddingBottom: 4,
      transition: "var(--transition-base)"
    }
  }, l.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      cursor: "pointer",
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: 14,
      color: "var(--ink)"
    }
  }, "Entrar"), /*#__PURE__*/React.createElement(DS.Button, {
    variant: "primary",
    size: "sm",
    onClick: () => onNav("expo")
  }, "Inscreva-se"))));
}
function Footer() {
  const cols = [{
    h: "Programas",
    items: ["Inglês geral", "Universidade", "High School", "Au Pair"]
  }, {
    h: "Destinos",
    items: ["Irlanda", "Canadá", "Austrália", "Malta"]
  }, {
    h: "Expo Intercâmbio",
    items: ["Sobre nós", "O evento", "Parceiros", "Contato"]
  }];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: "var(--gray-secondary)",
      color: "#fff",
      marginTop: 64
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "48px 32px 32px",
      display: "grid",
      gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Wordmark, {
    size: 20,
    reversed: true
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 13,
      lineHeight: 1.6,
      color: "rgba(255,255,255,.75)",
      marginTop: 14,
      maxWidth: 240
    }
  }, "O maior evento de mobilidade estudantil do Brasil. Conectamos voc\xEA \xE0s melhores oportunidades de estudo no exterior."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginTop: 18
    }
  }, ["instagram", "facebook", "youtube", "linkedin"].map(n => /*#__PURE__*/React.createElement("span", {
    key: n,
    style: {
      width: 32,
      height: 32,
      borderRadius: 4,
      background: "rgba(255,255,255,.12)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: n,
    size: 16,
    color: "#fff"
  }))))), cols.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.h
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 14,
      margin: "0 0 14px"
    }
  }, c.h), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      padding: 0,
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: 9
    }
  }, c.items.map(i => /*#__PURE__*/React.createElement("li", {
    key: i
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      cursor: "pointer",
      fontFamily: "var(--font-body)",
      fontSize: 13,
      color: "rgba(255,255,255,.75)"
    }
  }, i))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid rgba(255,255,255,.15)",
      padding: "18px 32px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "flex",
      justifyContent: "space-between",
      fontFamily: "var(--font-body)",
      fontSize: 12,
      color: "rgba(255,255,255,.6)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Expo Interc\xE2mbio. Todos os direitos reservados."), /*#__PURE__*/React.createElement("span", null, "Pol\xEDtica de privacidade \xB7 Termos de uso"))));
}
Object.assign(window, {
  Icon,
  Wordmark,
  Navbar,
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Chrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/ExpoEvent.jsx
try { (() => {
const DSe = window.ExpoIntercMbioDesignSystem_94a31c;
const AGENDA = [{
  time: "10:00",
  title: "Abertura — O futuro da mobilidade estudantil",
  room: "Palco Principal",
  tag: "Keynote"
}, {
  time: "11:30",
  title: "Como escolher seu destino de intercâmbio",
  room: "Sala Europa",
  tag: "Workshop"
}, {
  time: "14:00",
  title: "Bolsas e financiamento: o guia completo",
  room: "Sala Bolsas",
  tag: "Painel"
}, {
  time: "16:00",
  title: "Vistos de estudante sem complicação",
  room: "Sala Canadá",
  tag: "Workshop"
}];
function ExpoEvent() {
  const [sent, setSent] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    style: {
      position: "relative",
      color: "#fff",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/photos/crowd-hall.jpg",
    alt: "",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(135deg, rgba(0,68,186,0.92) 0%, rgba(14,106,165,0.88) 100%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "56px 32px",
      display: "grid",
      gridTemplateColumns: "1fr 0.8fr",
      gap: 48,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DSe.Badge, {
    tone: "onBrand"
  }, "Entrada gratuita"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 46,
      lineHeight: 1.2,
      margin: "16px 0 12px"
    }
  }, "Expo Interc\xE2mbio 2026"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 18,
      lineHeight: 1.6,
      color: "rgba(255,255,255,.88)",
      margin: "0 0 24px",
      maxWidth: 440
    }
  }, "Dois dias com mais de 120 escolas de 35 pa\xEDses, palestras, workshops e consultoria gratuita. Tudo em um s\xF3 lugar."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, [["calendar", "14 e 15 de agosto de 2026"], ["map-pin", "Expo Center Norte · São Paulo, SP"], ["clock", "10h às 19h"]].map(([ic, t]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontFamily: "var(--font-body)",
      fontSize: 15
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 18,
    color: "rgba(255,255,255,.85)"
  }), t)))), /*#__PURE__*/React.createElement(DSe.Card, {
    accent: "none",
    padding: "28px",
    style: {
      background: "#fff"
    }
  }, sent ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "24px 8px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: "999px",
      background: "#E6F8E9",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      margin: "0 auto 16px"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check-circle",
    size: 28,
    color: "#2E8B43"
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 22,
      color: "var(--ink)",
      margin: "0 0 6px"
    }
  }, "Inscri\xE7\xE3o confirmada!"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 14,
      color: "var(--gray-700)",
      margin: 0
    }
  }, "Enviamos seu ingresso digital por e-mail. Nos vemos em agosto. \uD83C\uDF93")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 22,
      color: "var(--ink)",
      margin: "0 0 4px"
    }
  }, "Garanta seu ingresso"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 14,
      color: "var(--gray-text)",
      margin: "0 0 20px"
    }
  }, "Gratuito \xB7 vagas limitadas por hor\xE1rio"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(DSe.Input, {
    label: "Nome completo",
    placeholder: "Seu nome"
  }), /*#__PURE__*/React.createElement(DSe.Input, {
    label: "E-mail",
    type: "email",
    placeholder: "voce@exemplo.com"
  }), /*#__PURE__*/React.createElement(DSe.Select, {
    label: "Tenho interesse em",
    placeholder: "Selecione",
    options: ["Idioma", "Graduação", "Pós", "High School", "Au Pair"]
  }), /*#__PURE__*/React.createElement(DSe.Checkbox, {
    label: "Aceito receber novidades e bolsas por e-mail",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(DSe.Button, {
    variant: "success",
    size: "lg",
    fullWidth: true,
    onClick: () => setSent(true)
  }, "Confirmar inscri\xE7\xE3o")))))), /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "56px 32px 0"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 34,
      color: "var(--ink)",
      margin: "0 0 8px"
    }
  }, "Programa\xE7\xE3o \xB7 Dia 1"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 15,
      color: "var(--gray-text)",
      margin: "0 0 24px"
    }
  }, "Palestras e workshops gratuitos ao longo dos dois dias."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, AGENDA.map(a => /*#__PURE__*/React.createElement(DSe.Card, {
    key: a.time,
    accent: "none",
    interactive: true,
    padding: "18px 22px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 22
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 20,
      color: "var(--blue-primary)",
      width: 70
    }
  }, a.time), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 17,
      color: "var(--ink)",
      margin: "0 0 3px"
    }
  }, a.title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 13,
      color: "var(--gray-text)"
    }
  }, a.room)), /*#__PURE__*/React.createElement(DSe.Badge, {
    tone: "info"
  }, a.tag)))))));
}
Object.assign(window, {
  ExpoEvent
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/ExpoEvent.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Home.jsx
try { (() => {
const DSh = window.ExpoIntercMbioDesignSystem_94a31c;
const PHOTO_BASE = "../../assets/photos/";

// Brand imagery block: real event photo (cover) under the brand blue overlay.
// Falls back to the brand gradient when no `src` is given.
function PhotoBlock({
  height = 200,
  src = "",
  radius = "var(--radius-lg)",
  icon = "image",
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height,
      borderRadius: radius,
      position: "relative",
      overflow: "hidden",
      background: "var(--gradient-brand)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      ...style
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: PHOTO_BASE + src,
    alt: "",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 28,
    color: "rgba(255,255,255,.55)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "var(--overlay-brand)"
    }
  }));
}
const PROGRAMS = [{
  title: "Inglês geral em Dublin",
  country: "Irlanda",
  weeks: "12 semanas",
  price: "R$ 18.900",
  tone: "success",
  tag: "Vagas abertas",
  photo: "networking.jpg"
}, {
  title: "Universidade em Toronto",
  country: "Canadá",
  weeks: "1 semestre",
  price: "R$ 42.500",
  tone: "info",
  tag: "Bolsa 20%",
  photo: "booth-canada.jpg"
}, {
  title: "High School na Austrália",
  country: "Austrália",
  weeks: "6 meses",
  price: "R$ 56.000",
  tone: "info",
  tag: "Destaque",
  photo: "students-1.jpg"
}];
function Home({
  onNav
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    style: {
      background: "var(--gray-50)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "64px 32px",
      display: "grid",
      gridTemplateColumns: "1.05fr 0.95fr",
      gap: 48,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DSh.Badge, {
    tone: "primary"
  }, "Edi\xE7\xE3o 2026 \xB7 S\xE3o Paulo"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 48,
      lineHeight: 1.2,
      color: "var(--ink)",
      margin: "16px 0 0",
      textWrap: "balance"
    }
  }, "Seu interc\xE2mbio come\xE7a ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--blue-primary)"
    }
  }, "aqui"), "."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 18,
      lineHeight: 1.6,
      color: "var(--gray-700)",
      margin: "16px 0 28px",
      maxWidth: 460
    }
  }, "Encontre programas, converse com escolas do mundo todo e garanta sua vaga no maior evento de mobilidade estudantil do Brasil."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(DSh.Button, {
    variant: "success",
    size: "lg",
    onClick: () => onNav("expo")
  }, "Inscreva-se no Expo"), /*#__PURE__*/React.createElement(DSh.Button, {
    variant: "secondary",
    size: "lg",
    onClick: () => onNav("programs")
  }, "Ver programas")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 32,
      marginTop: 36
    }
  }, [["+120", "escolas parceiras"], ["35", "países"], ["+18 mil", "alunos atendidos"]].map(([n, l]) => /*#__PURE__*/React.createElement("div", {
    key: l
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 26,
      color: "var(--blue-primary)"
    }
  }, n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 13,
      color: "var(--gray-text)"
    }
  }, l))))), /*#__PURE__*/React.createElement(PhotoBlock, {
    height: 380,
    src: "winners.jpg"
  }))), /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "56px 32px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 34,
      color: "var(--ink)",
      margin: 0
    }
  }, "Programas em destaque"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 15,
      color: "var(--gray-text)",
      margin: "6px 0 0"
    }
  }, "Selecionados pela nossa equipe para a edi\xE7\xE3o deste ano.")), /*#__PURE__*/React.createElement(DSh.Button, {
    variant: "link",
    onClick: () => onNav("programs")
  }, "Ver todos \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 24
    }
  }, PROGRAMS.map(p => /*#__PURE__*/React.createElement(DSh.Card, {
    key: p.title,
    accent: "top",
    interactive: true,
    padding: "0"
  }, /*#__PURE__*/React.createElement(PhotoBlock, {
    height: 150,
    radius: "0",
    src: p.photo
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(DSh.Badge, {
    tone: p.tone
  }, p.tag), /*#__PURE__*/React.createElement(DSh.Badge, {
    tone: "neutral"
  }, p.country)), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 20,
      color: "var(--ink)",
      margin: "0 0 4px"
    }
  }, p.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 14,
      color: "var(--gray-text)",
      margin: "0 0 16px"
    }
  }, p.weeks, " \xB7 acomoda\xE7\xE3o inclusa"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 24,
      color: "var(--blue-primary)"
    }
  }, p.price), /*#__PURE__*/React.createElement(DSh.Button, {
    variant: "link",
    onClick: () => onNav("programs")
  }, "Detalhes"))))))), /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "56px 32px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 24
    }
  }, [["award", "Escolas certificadas", "Apenas instituições acreditadas e auditadas pela nossa equipe."], ["send", "Processo sem fricção", "Inscrição, visto e acomodação em um só lugar."], ["users", "Atendimento humano", "Consultores que já viveram a experiência do intercâmbio."], ["heart", "Suporte no destino", "Acompanhamento durante toda a sua estadia."]].map(([icon, h, d]) => /*#__PURE__*/React.createElement("div", {
    key: h
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: "var(--radius-md)",
      background: "var(--blue-tint)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 22,
    color: "var(--blue-primary)"
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 18,
      color: "var(--ink)",
      margin: "0 0 6px"
    }
  }, h), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--gray-700)",
      margin: 0
    }
  }, d))))), /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "56px 32px 0"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 34,
      color: "var(--ink)",
      margin: "0 0 24px",
      textAlign: "center"
    }
  }, "Destinos em alta"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 24
    }
  }, [["landmark-bigben.png", "Reino Unido", "Londres, Manchester, Brighton"], ["landmark-cntower.png", "Canadá", "Toronto, Vancouver, Montréal"], ["landmark-liberty.png", "Estados Unidos", "Nova York, Boston, Miami"]].map(([img, country, cities]) => /*#__PURE__*/React.createElement("div", {
    key: country,
    style: {
      background: "var(--gray-50)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: "24px 24px 28px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 180,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/brand/" + img,
    alt: "",
    style: {
      maxHeight: "100%",
      maxWidth: "60%",
      objectFit: "contain"
    }
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 20,
      color: "var(--ink)",
      margin: "0 0 4px"
    }
  }, country), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 14,
      color: "var(--gray-text)",
      margin: 0
    }
  }, cities))))), /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "56px auto 0",
      padding: "0 32px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      overflow: "hidden",
      background: "var(--gradient-brand)",
      borderRadius: "var(--radius-lg)",
      padding: "48px 56px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/brand/ribbon-green.png",
    alt: "",
    style: {
      position: "absolute",
      right: -20,
      top: -40,
      height: "180%",
      opacity: 0.5,
      pointerEvents: "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 30,
      color: "#fff",
      margin: "0 0 8px"
    }
  }, "Garanta sua vaga no Expo 2026"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 16,
      color: "rgba(255,255,255,.85)",
      margin: 0
    }
  }, "Entrada gratuita \xB7 14\u201315 de agosto \xB7 Expo Center Norte, S\xE3o Paulo")), /*#__PURE__*/React.createElement(DSh.Button, {
    variant: "success",
    size: "lg",
    onClick: () => onNav("expo"),
    style: {
      position: "relative"
    }
  }, "Inscreva-se gratuitamente"))));
}
Object.assign(window, {
  Home,
  PhotoBlock
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Programs.jsx
try { (() => {
const DSp = window.ExpoIntercMbioDesignSystem_94a31c;
const ALL_PROGRAMS = [{
  title: "Inglês geral em Dublin",
  region: "Europa",
  country: "Irlanda",
  type: "Idioma",
  weeks: "12 semanas",
  price: "R$ 18.900",
  tag: "Vagas abertas",
  tone: "success",
  photo: "networking.jpg"
}, {
  title: "Universidade em Toronto",
  region: "América do Norte",
  country: "Canadá",
  type: "Graduação",
  weeks: "1 semestre",
  price: "R$ 42.500",
  tag: "Bolsa 20%",
  tone: "info",
  photo: "booth-canada.jpg"
}, {
  title: "High School na Austrália",
  region: "Oceania",
  country: "Austrália",
  type: "High School",
  weeks: "6 meses",
  price: "R$ 56.000",
  tag: "Destaque",
  tone: "info",
  photo: "students-1.jpg"
}, {
  title: "Inglês + trabalho em Malta",
  region: "Europa",
  country: "Malta",
  type: "Idioma",
  weeks: "24 semanas",
  price: "R$ 27.300",
  tag: "Work & Study",
  tone: "primary",
  photo: "students-2.jpg"
}, {
  title: "MBA em Londres",
  region: "Europa",
  country: "Reino Unido",
  type: "Pós",
  weeks: "1 ano",
  price: "R$ 98.000",
  tag: "Premium",
  tone: "neutral",
  photo: "consult.jpg"
}, {
  title: "Au Pair nos EUA",
  region: "América do Norte",
  country: "Estados Unidos",
  type: "Au Pair",
  weeks: "12 meses",
  price: "Sob consulta",
  tag: "Vagas abertas",
  tone: "success",
  photo: "students-3.jpg"
}];
function Programs({
  onNav
}) {
  const regions = ["Todos", "Europa", "América do Norte", "Oceania"];
  const [region, setRegion] = React.useState("Todos");
  const list = region === "Todos" ? ALL_PROGRAMS : ALL_PROGRAMS.filter(p => p.region === region);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--gray-100)",
      minHeight: "70vh"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--white)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "40px 32px"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 38,
      color: "var(--ink)",
      margin: 0
    }
  }, "Programas"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 16,
      color: "var(--gray-700)",
      margin: "8px 0 0"
    }
  }, ALL_PROGRAMS.length, " programas em 35 pa\xEDses. Filtre por regi\xE3o para come\xE7ar."))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "28px 32px 48px",
      display: "grid",
      gridTemplateColumns: "240px 1fr",
      gap: 32,
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement(DSp.Card, {
    accent: "none",
    padding: "20px",
    style: {
      position: "sticky",
      top: 88
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: ".04em",
      color: "var(--gray-text)",
      margin: "0 0 12px"
    }
  }, "Regi\xE3o"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 22
    }
  }, regions.map(r => /*#__PURE__*/React.createElement(DSp.Tag, {
    key: r,
    selected: region === r,
    onClick: () => setRegion(r)
  }, r))), /*#__PURE__*/React.createElement(DSp.Select, {
    label: "Tipo de programa",
    placeholder: "Todos os tipos",
    options: ["Idioma", "Graduação", "Pós", "High School", "Au Pair"],
    containerStyle: {
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement(DSp.Select, {
    label: "Dura\xE7\xE3o",
    placeholder: "Qualquer",
    options: ["Até 12 semanas", "3–6 meses", "6+ meses"]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,1fr)",
      gap: 20
    }
  }, list.map(p => /*#__PURE__*/React.createElement(DSp.Card, {
    key: p.title,
    accent: "top",
    interactive: true,
    padding: "0"
  }, /*#__PURE__*/React.createElement(PhotoBlock, {
    height: 130,
    radius: "0",
    src: p.photo
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(DSp.Badge, {
    tone: p.tone
  }, p.tag), /*#__PURE__*/React.createElement(DSp.Badge, {
    tone: "neutral"
  }, p.country)), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 18,
      color: "var(--ink)",
      margin: "0 0 4px"
    }
  }, p.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 13,
      color: "var(--gray-text)",
      margin: "0 0 14px"
    }
  }, p.type, " \xB7 ", p.weeks), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 20,
      color: "var(--blue-primary)"
    }
  }, p.price), /*#__PURE__*/React.createElement(DSp.Button, {
    variant: "secondary",
    size: "sm",
    onClick: () => onNav("expo")
  }, "Inscrever"))))))));
}
Object.assign(window, {
  Programs
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Programs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/WebsiteApp.jsx
try { (() => {
function WebsiteApp() {
  const [screen, setScreen] = React.useState("home");
  const onNav = s => {
    setScreen(s);
    window.scrollTo(0, 0);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "var(--white)"
    }
  }, /*#__PURE__*/React.createElement(Navbar, {
    current: screen,
    onNav: onNav
  }), screen === "home" && /*#__PURE__*/React.createElement(Home, {
    onNav: onNav
  }), screen === "programs" && /*#__PURE__*/React.createElement(Programs, {
    onNav: onNav
  }), (screen === "expo" || screen === "bolsas") && /*#__PURE__*/React.createElement(ExpoEvent, {
    onNav: onNav
  }), /*#__PURE__*/React.createElement(Footer, null));
}
Object.assign(window, {
  WebsiteApp
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/WebsiteApp.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
