import {
  createContext,
  createElement,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { marked } from "marked";
import { ChevronLeft, ChevronRight, Info, MoreHorizontal } from "lucide-react";
import {
  badgeClassNames,
  buttonClassNames,
  sortRowsByKey,
  stackStyle,
  type ButtonClassOptions,
  type SpacingStep,
  type StackAlignment,
  type StackOptions,
} from "./preline-ui-utils";

type BaseProps<T extends HTMLElement = HTMLElement> = Omit<
  HTMLAttributes<T>,
  "color" | "onChange"
> & {
  xstyle?: unknown;
};

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function paddingStyle(value: SpacingStep | undefined): CSSProperties {
  const map: Record<SpacingStep, string> = {
    0: "0",
    0.5: "0.125rem",
    1: "0.25rem",
    1.5: "0.375rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
  };
  return value == null ? {} : { padding: map[value] };
}

type StackProps = BaseProps & StackOptions & { as?: ElementType };

function StackBase({
  direction,
  hAlign,
  vAlign,
  justify,
  align,
  gap,
  padding,
  paddingInline,
  paddingBlock,
  width,
  height,
  maxWidth,
  minHeight,
  wrap,
  isScrollable,
  as = "div",
  className,
  style,
  xstyle: _xstyle,
  ...props
}: StackProps) {
  return createElement(as, {
    ...props,
    className,
    style: {
      ...stackStyle({
        direction,
        hAlign,
        vAlign,
        justify,
        align,
        gap,
        padding,
        paddingInline,
        paddingBlock,
        width,
        height,
        maxWidth,
        minHeight,
        wrap,
        isScrollable,
      }),
      ...style,
    },
  });
}

export function Stack(props: StackProps) {
  return <StackBase {...props} />;
}

export function HStack(props: Omit<StackProps, "direction">) {
  return <StackBase {...props} direction="horizontal" />;
}

export function VStack(props: Omit<StackProps, "direction">) {
  return <StackBase {...props} direction="vertical" />;
}

interface StackItemProps extends BaseProps {
  size?: "static" | "fill";
  crossAlignSelf?: StackAlignment;
  isScrollable?: boolean;
  as?: ElementType;
}

export function StackItem({
  size = "static",
  crossAlignSelf,
  isScrollable,
  as = "div",
  className,
  style,
  xstyle: _xstyle,
  ...props
}: StackItemProps) {
  return createElement(as, {
    ...props,
    className,
    style: {
      minWidth: 0,
      minHeight: 0,
      flex: size === "fill" ? "1 1 auto" : undefined,
      alignSelf:
        crossAlignSelf === "start"
          ? "flex-start"
          : crossAlignSelf === "end"
            ? "flex-end"
            : crossAlignSelf,
      overflow: isScrollable ? "auto" : undefined,
      ...style,
    },
  });
}

export interface TextProps extends BaseProps<HTMLSpanElement> {
  type?: string;
  size?: string;
  color?: string;
  weight?: string;
  display?: "inline" | "block";
  maxLines?: number;
  hasTabularNumbers?: boolean;
  wordBreak?: string;
  as?: ElementType;
  children?: ReactNode;
}

const TEXT_SIZES: Record<string, string> = {
  xs: "text-[11px]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

const TEXT_WEIGHTS: Record<string, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const TEXT_COLORS: Record<string, string> = {
  primary: "text-app-ink",
  secondary: "text-app-muted",
  accent: "text-primary",
  success: "text-app-success",
  error: "text-destructive",
  inherit: "",
};

export function Text({
  type = "body",
  size,
  color,
  weight,
  display = "inline",
  maxLines = 0,
  hasTabularNumbers,
  as: Component = "span",
  className,
  style,
  xstyle: _xstyle,
  children,
  ...props
}: TextProps) {
  const resolvedSize =
    size ??
    (type === "supporting" || type === "label" ? "sm" : type === "large" ? "lg" : "md");
  const resolvedColor = color ?? (type === "supporting" ? "secondary" : "primary");

  return (
    <Component
      {...props}
      className={cn(
        TEXT_SIZES[resolvedSize] ?? "text-sm",
        TEXT_WEIGHTS[weight ?? (type === "label" ? "medium" : "normal")],
        TEXT_COLORS[resolvedColor],
        type === "code" && "font-mono",
        hasTabularNumbers && "tabular-nums",
        display === "block" && "block",
        maxLines > 0 && "overflow-hidden",
        className,
      )}
      style={{
        display: maxLines > 0 ? "-webkit-box" : undefined,
        WebkitBoxOrient: maxLines > 0 ? "vertical" : undefined,
        WebkitLineClamp: maxLines || undefined,
        ...style,
      }}
    >
      {children}
    </Component>
  );
}

export interface HeadingProps extends BaseProps<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  children?: ReactNode;
}

export function Heading({ level = 2, className, children, ...props }: HeadingProps) {
  const classes = {
    1: "text-2xl font-semibold tracking-tight",
    2: "text-xl font-semibold tracking-tight",
    3: "text-lg font-semibold",
    4: "text-base font-semibold",
    5: "text-sm font-semibold",
    6: "text-xs font-semibold",
  }[level];
  return createElement(
    `h${level}`,
    { ...props, className: cn("text-app-ink", classes, className) },
    children,
  );
}

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick">,
    ButtonClassOptions {
  label?: string;
  children?: ReactNode;
  icon?: ReactNode;
  endContent?: ReactNode;
  isIconOnly?: boolean;
  width?: number | string;
  onClick?: () => void;
  href?: string;
  tooltip?: string;
}

export function Button({
  label,
  children,
  icon,
  endContent,
  isIconOnly,
  width,
  variant,
  size,
  isDisabled,
  isLoading,
  onClick,
  className,
  style,
  type = "button",
  href,
  tooltip,
  ...props
}: ButtonProps) {
  const content = (
    <>
      {isLoading ? <Spinner size="sm" /> : icon}
      {isIconOnly ? null : <span>{children ?? label}</span>}
      {endContent}
    </>
  );
  const classes = cn(
    buttonClassNames({ variant, size, isDisabled, isLoading }),
    isIconOnly && "aspect-square px-0",
    className,
  );
  const shared = {
    "aria-label": props["aria-label"] ?? (isIconOnly ? label : undefined),
    "aria-disabled": isDisabled || isLoading || undefined,
    className: classes,
    style: { ...style, width: typeof width === "number" ? `${width}px` : width },
    title: tooltip,
  };

  if (href && !isDisabled && !isLoading) {
    return (
      <a {...shared} href={href}>
        {content}
      </a>
    );
  }

  return (
    <button
      {...props}
      {...shared}
      type={type}
      disabled={isDisabled || isLoading}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonProps, "children" | "label"> {
  label: string;
}

export function IconButton({ label, ...props }: IconButtonProps) {
  return <Button {...props} label={label} isIconOnly />;
}

interface PaginationProps extends Omit<BaseProps<HTMLElement>, "onChange"> {
  page: number;
  pageCount: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  tokens: Array<number | "ellipsis-left" | "ellipsis-right">;
  label?: string;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  pageCount,
  total,
  rangeStart,
  rangeEnd,
  tokens,
  label = "分页",
  onPageChange,
  className,
  ...props
}: PaginationProps) {
  return (
    <nav
      {...props}
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-app-line px-3 py-2.5",
        className,
      )}
    >
      <span className="font-mono text-[10px] text-app-muted">
        {rangeStart}–{rangeEnd} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="focus-ring grid size-7 place-items-center rounded-md border border-app-line text-app-muted transition hover:bg-app-surface disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        {tokens.map((token) =>
          typeof token === "number" ? (
            <button
              key={token}
              type="button"
              className={cn(
                "focus-ring grid min-w-7 place-items-center rounded-md px-1.5 font-mono text-[10px] transition",
                token === page
                  ? "h-7 bg-primary text-primary-foreground"
                  : "h-7 text-app-muted hover:bg-app-surface hover:text-app-ink",
              )}
              aria-label={`第 ${token} 页`}
              aria-current={token === page ? "page" : undefined}
              onClick={() => onPageChange(token)}
            >
              {token}
            </button>
          ) : (
            <span
              key={token}
              className="grid size-7 place-items-center text-app-muted"
              aria-hidden="true"
            >
              <MoreHorizontal className="size-3.5" />
            </span>
          ),
        )}
        <button
          type="button"
          className="focus-ring grid size-7 place-items-center rounded-md border border-app-line text-app-muted transition hover:bg-app-surface disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="下一页"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}

interface CardProps extends BaseProps {
  padding?: SpacingStep;
  height?: number | string;
  variant?: string;
}

export function Card({
  padding,
  height,
  variant = "default",
  className,
  style,
  xstyle: _xstyle,
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-xl border border-app-line bg-app-panel",
        variant === "detached" && "shadow-sm",
        className,
      )}
      style={{
        ...paddingStyle(padding),
        height: typeof height === "number" ? `${height}px` : height,
        ...style,
      }}
    />
  );
}

export function Section({ className, children, ...props }: BaseProps) {
  return (
    <section {...props} className={cn("space-y-3", className)}>
      {children}
    </section>
  );
}

export interface GridProps extends BaseProps {
  columns?: { minWidth?: number; max?: number } | number;
  gap?: SpacingStep;
}

export function Grid({ columns, gap = 3, className, style, ...props }: GridProps) {
  const minWidth = typeof columns === "object" ? (columns.minWidth ?? 240) : 220;
  return (
    <div
      {...props}
      className={cn("grid", className)}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minWidth}px), 1fr))`,
        gap: stackStyle({ gap }).gap,
        ...style,
      }}
    />
  );
}

interface FieldProps {
  label?: string;
  description?: string;
  isLabelHidden?: boolean;
  hasClear?: boolean;
  size?: string;
  disabledMessage?: string;
}

interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "size" | "value">,
    FieldProps {
  value?: string;
  onChange?: (value: string) => void;
  isRequired?: boolean;
  isDisabled?: boolean;
  hasAutoFocus?: boolean;
  startIcon?: ReactNode;
  onEnter?: () => void;
}

export function TextInput({
  label,
  description,
  isLabelHidden,
  value = "",
  onChange,
  className,
  hasClear,
  size: _size,
  isDisabled,
  disabledMessage,
  isRequired,
  hasAutoFocus,
  startIcon,
  onEnter,
  onKeyDown,
  style,
  ...props
}: TextInputProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <label className={cn("block min-w-0", className)} htmlFor={id}>
      {!isLabelHidden && label ? (
        <span className="mb-1 block text-xs font-medium text-app-ink">{label}</span>
      ) : null}
      <span className="relative block">
        {startIcon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted">
            {startIcon}
          </span>
        ) : null}
        <input
          {...props}
          id={id}
          value={value}
          disabled={isDisabled}
          required={isRequired}
          autoFocus={hasAutoFocus}
          onChange={(event) => onChange?.(event.currentTarget.value)}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.key === "Enter" && !event.nativeEvent.isComposing) onEnter?.();
          }}
          className={cn(
            "focus-ring h-9 w-full rounded-lg border border-app-line bg-app-panel pr-3 text-sm text-app-ink placeholder:text-app-faint disabled:cursor-not-allowed disabled:opacity-60",
            startIcon ? "pl-9" : "pl-3",
            hasClear && "pr-9",
          )}
          style={style}
        />
        {hasClear && value && !isDisabled ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-app-muted hover:bg-app-surface hover:text-app-ink"
            aria-label="清除"
            onClick={() => onChange?.("")}
          >
            ×
          </button>
        ) : null}
      </span>
      {description ? <span className="mt-1 block text-[11px] text-app-muted">{description}</span> : null}
      {isDisabled && disabledMessage ? (
        <span className="mt-1 block text-[11px] text-app-faint">{disabledMessage}</span>
      ) : null}
    </label>
  );
}

interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value">,
    FieldProps {
  value?: string;
  onChange?: (value: string) => void;
  isDisabled?: boolean;
}

export function TextArea({
  label,
  description,
  isLabelHidden,
  value = "",
  onChange,
  isDisabled,
  className,
  ...props
}: TextAreaProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <label className={cn("block min-w-0", className)} htmlFor={id}>
      {!isLabelHidden && label ? (
        <span className="mb-1 block text-xs font-medium text-app-ink">{label}</span>
      ) : null}
      <textarea
        {...props}
        id={id}
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        className="focus-ring min-h-24 w-full rounded-lg border border-app-line bg-app-panel px-3 py-2 text-sm text-app-ink placeholder:text-app-faint disabled:cursor-not-allowed disabled:opacity-60"
      />
      {description ? <span className="mt-1 block text-[11px] text-app-muted">{description}</span> : null}
    </label>
  );
}

export type ISODateString = string;

interface DateInputProps extends Omit<TextInputProps, "type"> {
  max?: ISODateString;
  min?: ISODateString;
}

export function DateInput(props: DateInputProps) {
  return <TextInput {...props} type="date" />;
}

interface SwitchProps extends Omit<BaseProps, "onChange"> {
  label?: string;
  description?: string;
  value?: boolean;
  onChange?: (value: boolean) => void;
  isDisabled?: boolean;
  isLoading?: boolean;
  labelPosition?: "start" | "end";
  labelSpacing?: "spread" | "compact";
}

export function Switch({
  label,
  description,
  value = false,
  onChange,
  isDisabled,
  isLoading,
  labelPosition = "end",
  labelSpacing = "compact",
  className,
  style,
  ...props
}: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={value}
      disabled={isDisabled || isLoading}
      onClick={() => onChange?.(!value)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition",
        value ? "border-primary bg-primary" : "border-app-line-strong bg-app-surface",
        (isDisabled || isLoading) && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-3.5 rounded-full bg-app-panel shadow-sm transition-transform",
          value ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
  const copy = label ? (
    <span className="min-w-0">
      <span className="block text-sm text-app-ink">{label}</span>
      {description ? <span className="block text-[11px] text-app-muted">{description}</span> : null}
    </span>
  ) : null;

  return (
    <div
      {...props}
      className={cn(
        "flex items-center gap-2",
        labelSpacing === "spread" && "justify-between",
        className,
      )}
      style={style}
    >
      {labelPosition === "start" ? copy : null}
      {control}
      {labelPosition === "end" ? copy : null}
    </div>
  );
}

interface SliderProps extends Omit<BaseProps, "onChange"> {
  label?: string;
  isLabelHidden?: boolean;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  isDisabled?: boolean;
  valueDisplay?: string;
}

export function Slider({
  label,
  isLabelHidden,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  isDisabled,
  valueDisplay: _valueDisplay,
  className,
  ...props
}: SliderProps) {
  return (
    <label className={cn("block min-w-0", className)}>
      {!isLabelHidden && label ? <span className="mb-1 block text-xs text-app-muted">{label}</span> : null}
      <input
        {...props}
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={isDisabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-1.5 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

interface TabContextValue {
  value: string;
  onChange: (value: string) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

interface TabListProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  hasDivider?: boolean;
  size?: string;
}

export function TabList({
  value,
  onChange,
  hasDivider: _hasDivider,
  size: _size,
  className,
  children,
  ...props
}: TabListProps) {
  return (
    <TabContext.Provider value={{ value, onChange }}>
      <div {...props} role="tablist" className={cn("flex flex-wrap gap-1", className)}>
        {children}
      </div>
    </TabContext.Provider>
  );
}

interface TabProps {
  value: string;
  label: string;
  isDisabled?: boolean;
}

export function Tab({ value, label, isDisabled }: TabProps) {
  const context = useContext(TabContext);
  const selected = context?.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={isDisabled}
      onClick={() => context?.onChange(value)}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-xs transition",
        selected ? "bg-primary text-primary-foreground" : "text-app-muted hover:bg-app-surface hover:text-app-ink",
      )}
    >
      {label}
    </button>
  );
}

const SegmentContext = createContext<TabContextValue | null>(null);

interface SegmentedControlProps extends TabListProps {
  label?: string;
  layout?: "fill" | "hug";
  isDisabled?: boolean;
  disabledMessage?: string;
}

export function SegmentedControl({
  value,
  onChange,
  label,
  layout = "hug",
  isDisabled,
  className,
  children,
  ...props
}: SegmentedControlProps) {
  return (
    <SegmentContext.Provider value={isDisabled ? { value, onChange: () => undefined } : { value, onChange }}>
      <div
        {...props}
        role="radiogroup"
        aria-label={label}
        className={cn(
          "inline-flex gap-1 rounded-lg border border-app-line bg-app-surface p-1",
          layout === "fill" && "flex w-full",
          isDisabled && "opacity-60",
          className,
        )}
      >
        {children}
      </div>
    </SegmentContext.Provider>
  );
}

interface SegmentedControlItemProps {
  value: string;
  label: string;
  icon?: ReactNode;
}

export function SegmentedControlItem({ value, label, icon }: SegmentedControlItemProps) {
  const context = useContext(SegmentContext);
  const selected = context?.value === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => context?.onChange(value)}
      className={cn(
        "min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs transition",
        selected ? "bg-app-panel font-medium text-app-ink shadow-sm" : "text-app-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface Option {
  label: string;
  value: string;
}

interface SelectorProps extends Omit<BaseProps, "onChange"> {
  label?: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  width?: number | string;
}

export function Selector({
  label,
  options,
  value,
  onChange,
  placeholder,
  isDisabled,
  width,
  className,
  ...props
}: SelectorProps) {
  return (
    <label className={cn("block", className)} style={{ width }}>
      {label ? <span className="mb-1 block text-xs text-app-muted">{label}</span> : null}
      <select
        {...props}
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="focus-ring h-9 w-full rounded-lg border border-app-line bg-app-panel px-2.5 text-sm text-app-ink disabled:opacity-60"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface MultiSelectorProps extends Omit<SelectorProps, "value" | "onChange"> {
  value: readonly string[];
  onChange: (value: string[]) => void;
  hasSearch?: boolean;
  hasSelectAll?: boolean;
  hasClear?: boolean;
}

export function MultiSelector({
  label,
  options,
  value,
  onChange,
  isDisabled,
  width,
  className,
  ...props
}: MultiSelectorProps) {
  return (
    <label className={cn("block", className)} style={{ width }}>
      {label ? <span className="mb-1 block text-xs text-app-muted">{label}</span> : null}
      <select
        {...props}
        multiple
        value={[...value]}
        disabled={isDisabled}
        onChange={(event) =>
          onChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))
        }
        className="focus-ring min-h-24 w-full rounded-lg border border-app-line bg-app-panel px-2.5 py-1.5 text-sm text-app-ink disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const ToggleContext = createContext<{
  values: readonly string[];
  onChange: (values: string[]) => void;
} | null>(null);

interface ToggleButtonGroupProps extends Omit<BaseProps, "onChange"> {
  type?: "single" | "multiple";
  value: readonly string[] | string;
  onChange: (value: readonly string[] | string) => void;
  label?: string;
  size?: string;
}

export function ToggleButtonGroup({
  type = "single",
  value,
  onChange,
  label,
  className,
  children,
  ...props
}: ToggleButtonGroupProps) {
  const values = Array.isArray(value) ? value : [value];
  const handleChange = (next: string[]) => {
    onChange(type === "multiple" ? next : (next.at(-1) ?? ""));
  };
  return (
    <ToggleContext.Provider value={{ values, onChange: handleChange }}>
      <div
        {...props}
        role="group"
        aria-label={label}
        className={cn("inline-flex flex-wrap gap-1 rounded-lg bg-app-surface p-1", className)}
      >
        {children}
      </div>
    </ToggleContext.Provider>
  );
}

export function ToggleButton({ value, label }: { value: string; label: string }) {
  const context = useContext(ToggleContext);
  const selected = context?.values.includes(value) ?? false;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => {
        if (!context) return;
        context.onChange(
          selected
            ? context.values.filter((item) => item !== value)
            : [...context.values, value],
        );
      }}
      className={cn(
        "focus-ring rounded-md px-2.5 py-1.5 text-xs transition",
        selected ? "bg-primary text-primary-foreground" : "text-app-muted hover:bg-app-panel",
      )}
    >
      {label}
    </button>
  );
}

export function Badge({
  label,
  children,
  variant,
  className,
}: {
  label?: ReactNode;
  children?: ReactNode;
  variant?: string;
  className?: string;
}) {
  return <span className={cn(badgeClassNames(variant), className)}>{children ?? label}</span>;
}

export function Spinner({ label, size, className }: { label?: string; size?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-app-muted", className)} role="status">
      <span
        className={cn(
          "animate-spin rounded-full border-2 border-app-line border-t-primary",
          size === "sm" ? "size-3.5" : "size-5",
        )}
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function StatusDot({
  label,
  variant = "neutral",
  isPulsing,
  tooltip,
}: {
  label?: string;
  variant?: string;
  isPulsing?: boolean;
  tooltip?: string;
}) {
  const color = {
    success: "bg-app-success",
    warning: "bg-app-warning",
    error: "bg-destructive",
    accent: "bg-primary",
    neutral: "bg-app-line-strong",
  }[variant] ?? "bg-app-line-strong";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-app-muted" title={tooltip}>
      <span className={cn("size-2 rounded-full", color, isPulsing && "animate-pulse")} />
      {label}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label,
  isLabelHidden,
  hasValueLabel,
  isIndeterminate,
  variant,
  formatValueLabel,
}: {
  value: number;
  max?: number;
  label?: string;
  isLabelHidden?: boolean;
  hasValueLabel?: boolean;
  isIndeterminate?: boolean;
  variant?: string;
  formatValueLabel?: (value: number, max: number) => string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="min-w-0">
      {!isLabelHidden && (label || hasValueLabel) ? (
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-app-muted">
          <span>{label}</span>
          {hasValueLabel ? <span>{formatValueLabel?.(value, max) ?? `${Math.round(pct)}%`}</span> : null}
        </div>
      ) : null}
      <div className="h-1.5 overflow-hidden rounded-full bg-app-surface" aria-label={label}>
        <div
          className={cn(
            "h-full rounded-full",
            variant === "error" ? "bg-destructive" : "bg-primary",
            isIndeterminate && "animate-pulse",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export interface ColumnWidth {
  type: "proportional" | "pixel";
  value: number;
  minWidth?: number;
}

export function proportional(
  value: number,
  options?: number | { minWidth?: number },
): ColumnWidth {
  return {
    type: "proportional",
    value,
    minWidth: typeof options === "number" ? options : options?.minWidth,
  };
}

export function pixel(value: number): ColumnWidth {
  return { type: "pixel", value };
}

export interface TableColumn<T extends Record<string, unknown>> {
  key: string;
  header?: ReactNode;
  width?: ColumnWidth;
  align?: "start" | "center" | "end";
  renderCell?: (item: T) => ReactNode;
}

interface TableProps<T extends Record<string, unknown>> extends BaseProps<HTMLDivElement> {
  idKey?: keyof T;
  columns?: readonly TableColumn<T>[];
  data?: readonly T[];
  density?: string;
  dividers?: string;
  isStriped?: boolean;
  hasHover?: boolean;
  textOverflow?: "wrap" | "truncate";
  verticalAlign?: string;
  plugins?: {
    selection?: TableSelectionConfig<T>;
    sort?: SortState<T>;
    [name: string]: unknown;
  };
}

export function Table<T extends Record<string, unknown>>({
  idKey,
  columns,
  data,
  density = "balanced",
  dividers = "rows",
  isStriped,
  hasHover,
  textOverflow = "wrap",
  plugins,
  className,
  children,
  ...props
}: TableProps<T>) {
  if (!columns || !data) {
    return (
      <div {...props} className={cn("overflow-auto rounded-xl border border-app-line", className)}>
        {children}
      </div>
    );
  }

  return (
    <div {...props} className={cn("overflow-auto rounded-xl border border-app-line", className)}>
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <thead className="bg-app-surface">
          <tr>
            {plugins?.selection ? (
              <th className="w-10 border-b border-app-line px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="全选"
                  checked={plugins.selection.getIsAllSelected()}
                  ref={(input) => {
                    if (input) input.indeterminate = plugins.selection?.getIsIndeterminate() ?? false;
                  }}
                  onChange={(event) =>
                    plugins.selection?.onSelectAll({ isAllSelected: event.currentTarget.checked })
                  }
                  className="size-4 rounded border-app-line-strong text-primary"
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "border-b border-app-line px-3 py-2 text-xs font-medium text-app-muted",
                  column.align === "end" && "text-right",
                  column.align === "center" && "text-center",
                )}
                style={{
                  width:
                    column.width?.type === "pixel"
                      ? `${column.width.value}px`
                      : column.width?.minWidth
                        ? `${column.width.minWidth}px`
                        : undefined,
                }}
              >
                {plugins?.sort ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => plugins.sort?.onSort?.(column.key as keyof T)}
                  >
                    {column.header ?? column.key}
                    <span aria-hidden>
                      {plugins.sort.key === column.key
                        ? plugins.sort.direction === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </span>
                  </button>
                ) : (
                  (column.header ?? column.key)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={String(idKey ? row[idKey] : index)}
              className={cn(
                isStriped && "odd:bg-app-surface/60",
                hasHover && "hover:bg-app-surface/70",
                dividers === "rows" && "border-b border-app-line last:border-0",
              )}
            >
              {plugins?.selection ? (
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    aria-label="选择当前行"
                    checked={plugins.selection.getIsItemSelected(row)}
                    onChange={(event) =>
                      plugins.selection?.onSelectItem({
                        item: row,
                        isSelected: event.currentTarget.checked,
                      })
                    }
                    className="size-4 rounded border-app-line-strong text-primary"
                  />
                </td>
              ) : null}
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5",
                    "align-middle text-app-ink",
                    textOverflow === "truncate" && "max-w-64 truncate",
                    column.align === "end" && "text-right",
                    column.align === "center" && "text-center",
                  )}
                >
                  {column.renderCell ? column.renderCell(row) : String(row[column.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} className={cn("border-b border-app-line last:border-0", className)} />;
}

export function TableCell({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cn("px-3 py-2 text-app-ink", className)} />;
}

export function TableHeaderCell({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} className={cn("px-3 py-2 text-xs font-medium text-app-muted", className)} />;
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} className={cn("bg-app-surface", className)} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} className={className} />;
}

export function TableFooter({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot {...props} className={className} />;
}

export function useTableStickyColumns<T extends Record<string, unknown>>(_options: unknown) {
  return {} as { id?: string; _row?: T };
}

interface SortState<T extends Record<string, unknown>> {
  key: keyof T | null;
  direction: "asc" | "desc";
  comparators?: Partial<Record<keyof T, (a: T, b: T) => number>>;
  onSort?: (key: keyof T) => void;
}

export function useTableSortableState<T extends Record<string, unknown>>(config: {
  data: T[];
  comparators?: Partial<Record<keyof T, (a: T, b: T) => number>>;
}): {
  sortedData: T[];
  sortConfig: SortState<T>;
} {
  const [sort, setSort] = useState<Pick<SortState<T>, "key" | "direction">>({
    key: null,
    direction: "asc",
  });
  const sortedData = useMemo(() => {
    if (sort.key == null) return config.data;
    return sortRowsByKey(
      config.data,
      sort.key,
      sort.direction,
      config.comparators?.[sort.key],
    );
  }, [config.comparators, config.data, sort.direction, sort.key]);

  return {
    sortedData,
    sortConfig: {
      ...sort,
      comparators: config.comparators,
      onSort: (key) => {
        setSort((current) => ({
          key,
          direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
        }));
      },
    },
  };
}

export function useTableSortable<T extends Record<string, unknown>>(sortConfig: SortState<T>) {
  return { ...sortConfig };
}

export interface TableSelectionConfig<T extends Record<string, unknown>> {
  getIsItemSelected: (item: T) => boolean;
  onSelectItem: (event: { item: T; isSelected: boolean }) => void;
  onSelectAll: (event: { isAllSelected: boolean }) => void;
  getIsAllSelected: () => boolean;
  getIsIndeterminate: () => boolean;
}

export function useTableSelection<T extends Record<string, unknown>>(
  config: TableSelectionConfig<T>,
): TableSelectionConfig<T> {
  return config;
}

export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={cn("rounded bg-app-surface px-1.5 py-0.5 font-mono text-[11px] text-app-ink", className)}>
      {children}
    </code>
  );
}

export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  width?: string;
  isWrapped?: boolean;
  className?: string;
}) {
  return (
    <pre className={cn("overflow-auto rounded-xl border border-app-line bg-app-surface p-4", className)}>
      <code className="font-mono text-xs text-app-ink" data-language={language}>
        {code}
      </code>
    </pre>
  );
}

export function FieldStatus({
  type = "neutral",
  message,
  variant,
}: {
  type?: string;
  message?: string;
  variant?: string;
}) {
  return (
    <p
      className={cn(
        "text-[11px]",
        type === "error" ? "text-destructive" : type === "success" ? "text-app-success" : "text-app-muted",
        variant === "detached" && "mt-1",
      )}
    >
      {message}
    </p>
  );
}

export function Skeleton({
  height,
  width,
  radius,
  index: _index,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
  index?: number;
}) {
  return (
    <div
      className="animate-pulse bg-app-surface"
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width: typeof width === "number" ? `${width}px` : width,
        borderRadius: radius == null ? "0.5rem" : `${radius * 4}px`,
      }}
    />
  );
}

export function EmptyState({
  title = "暂无数据",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium text-app-ink">{title}</p>
      {description ? <p className="mt-1 text-xs text-app-muted">{description}</p> : null}
    </div>
  );
}

export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  placement?: string;
  alignment?: string;
  className?: string;
}) {
  return (
    <span className={cn("group relative inline-flex", className)} title={typeof content === "string" ? content : undefined}>
      {children}
      {typeof content === "string" ? null : (
        <span className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 hidden min-w-40 rounded-lg border border-app-line bg-app-panel p-2 text-xs shadow-xl group-hover:block group-focus-within:block">
          {content}
        </span>
      )}
    </span>
  );
}

export function HoverCard({
  content,
  children,
  className,
  hasHoverIndication: _hasHoverIndication,
}: {
  content: ReactNode;
  children: ReactNode;
  placement?: string;
  alignment?: string;
  className?: string;
  hasHoverIndication?: boolean;
}) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span className="invisible absolute left-0 top-full z-50 mt-2 rounded-xl border border-app-line bg-app-panel p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {content}
      </span>
    </span>
  );
}

interface DialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  width?: number | string;
  maxHeight?: string;
  purpose?: string;
}

export function Dialog({ isOpen, onOpenChange, width = 480, children }: DialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onOpenChange]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭对话框"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[85vh] w-full overflow-auto rounded-2xl border border-app-line bg-app-panel shadow-2xl"
        style={{ maxWidth: typeof width === "number" ? `${width}px` : width }}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  title,
  subtitle,
  onOpenChange,
}: {
  title: string;
  subtitle?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-app-line p-5">
      <div>
        <h2 className="text-base font-semibold text-app-ink">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-app-muted">{subtitle}</p> : null}
      </div>
      {onOpenChange ? (
        <button
          type="button"
          className="focus-ring grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-surface hover:text-app-ink"
          aria-label="关闭"
          onClick={() => onOpenChange(false)}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function Layout({
  header,
  content,
  footer,
}: {
  header?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {header}
      {content}
      {footer}
    </>
  );
}

export function LayoutContent({ className, children, ...props }: BaseProps) {
  return (
    <div {...props} className={cn("p-5", className)}>
      {children}
    </div>
  );
}

export function LayoutFooter({
  hasDivider,
  className,
  children,
  ...props
}: BaseProps & { hasDivider?: boolean }) {
  return (
    <div {...props} className={cn("p-5", hasDivider && "border-t border-app-line", className)}>
      {children}
    </div>
  );
}

interface DropdownMenuItem {
  label: string;
  onClick?: () => void;
  isDisabled?: boolean;
  icon?: unknown;
}

interface DropdownMenuProps {
  button?: ButtonProps;
  items?: Array<DropdownMenuItem | { type: "divider" }>;
  children?: ReactNode;
  hasChevron?: boolean;
  menuWidth?: number | string;
}

export function DropdownMenu({ button, items, children, menuWidth }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <Button
        {...button}
        label={button?.label}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      />
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 rounded-xl border border-app-line bg-app-panel p-1.5 shadow-xl"
          style={{ minWidth: typeof menuWidth === "number" ? `${menuWidth}px` : menuWidth }}
        >
          {items?.map((item, index) => {
            if ("type" in item) return <div key={index} className="my-1 border-t border-app-line" />;
            const IconComponent = typeof item.icon === "function" ? (item.icon as ElementType) : null;
            return (
              <button
                key={item.label}
                type="button"
                disabled={item.isDisabled}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-muted hover:bg-app-surface hover:text-app-ink disabled:opacity-50"
                onClick={() => {
                  item.onClick?.();
                  setOpen(false);
                }}
              >
                {IconComponent
                  ? createElement(IconComponent, { className: "size-4" })
                  : (item.icon as ReactNode)}
                {item.label}
              </button>
            );
          })}
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Avatar({
  src,
  name,
  size = 32,
}: {
  src?: string;
  name?: string;
  size?: number | "small" | "medium" | "large";
}) {
  const pixels = typeof size === "number" ? size : size === "small" ? 24 : size === "large" ? 48 : 32;
  return src ? (
    <img src={src} alt={name ?? ""} className="rounded-full object-cover" style={{ width: pixels, height: pixels }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary/10 font-medium text-primary"
      style={{ width: pixels, height: pixels }}
    >
      {(name ?? "AI").slice(0, 1)}
    </span>
  );
}

export function Timestamp({ value, format = "time" }: { value: Date | number | string; format?: "time" | "date" }) {
  const date = new Date(value);
  return (
    <time className="text-[11px] text-app-faint" dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat("zh-CN", format === "time" ? { hour: "2-digit", minute: "2-digit" } : { month: "2-digit", day: "2-digit" }).format(date)}
    </time>
  );
}

export function Icon({
  icon,
  size = "md",
  className,
  style,
}: {
  icon: string | ElementType;
  size?: string;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const Component = typeof icon === "function" ? icon : icon === "moreHorizontal" ? MoreHorizontal : Info;
  return <Component className={cn(size === "lg" ? "size-5" : "size-4", className)} style={style} />;
}

export function SelectableCard({
  label,
  isSelected,
  onChange,
  padding,
  children,
}: {
  label: string;
  isSelected?: boolean;
  onChange?: () => void;
  padding?: SpacingStep;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onChange}
      className={cn(
        "rounded-xl border text-left transition",
        isSelected ? "border-primary bg-primary/5" : "border-app-line bg-app-panel hover:border-app-line-strong",
      )}
      style={paddingStyle(padding)}
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}

export function List({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("divide-y divide-app-line overflow-hidden rounded-xl border border-app-line", className)}>{children}</div>;
}

export function ListItem({
  label,
  description,
  isSelected,
  onClick,
}: {
  label: string;
  description?: string;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full px-3 py-2 text-left transition",
        isSelected ? "bg-primary/10 text-primary" : "bg-app-panel text-app-ink hover:bg-app-surface",
      )}
    >
      <span className="block text-sm font-medium">{label}</span>
      {description ? <span className="mt-0.5 block truncate text-[11px] text-app-muted">{description}</span> : null}
    </button>
  );
}

export function MetadataList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  columns?: string;
  label?: unknown;
}) {
  return <dl className={cn("grid gap-2", className)}>{children}</dl>;
}

export function MetadataListItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-sm">
      <dt className="text-xs text-app-muted">{label}</dt>
      <dd className="min-w-0 text-app-ink">{children}</dd>
    </div>
  );
}

export function FileInput({
  label,
  accept,
  onChange,
  isDisabled,
}: {
  label?: string;
  accept?: string;
  maxSize?: number;
  value?: File | File[] | null;
  onChange?: (file: File | File[] | null) => void;
  placeholder?: string;
  isDisabled?: boolean;
}) {
  return (
    <label className="block text-xs text-app-muted">
      {label}
      <input
        type="file"
        accept={accept}
        disabled={isDisabled}
        className="mt-1 block w-full text-xs text-app-muted"
        onChange={(event) => onChange?.(event.currentTarget.files?.[0] ?? null)}
      />
    </label>
  );
}

export function LinkProvider({
  children,
  component: _component,
}: {
  children: ReactNode;
  component?: ElementType;
}) {
  return children;
}

export interface OutlineItem {
  id: string;
  label: string;
  level: number;
}

export function useOutlineFromDOM(ref: React.RefObject<HTMLElement | null>): OutlineItem[] {
  const [items, setItems] = useState<OutlineItem[]>([]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const update = () => {
      setItems(
        Array.from(root.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4"))
          .filter((heading) => heading.id)
          .map((heading) => ({
            id: heading.id,
            label: heading.textContent ?? "",
            level: Number(heading.tagName.slice(1)),
          })),
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref]);
  return items;
}

export function Outline({ items, label }: { items: OutlineItem[]; density?: string; label?: string }) {
  return (
    <nav aria-label={label} className="border-l border-app-line">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="block border-l-2 border-transparent py-1 pl-2 text-xs text-app-muted hover:border-primary hover:text-app-ink"
          style={{ paddingLeft: `${Math.max(0, item.level - 1) * 10 + 8}px` }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderMarkdownHtml(content: string): string {
  const renderer = new marked.Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  return marked.parse(content, { renderer, async: false });
}

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form").forEach((node) => node.remove());
  for (const element of doc.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("on") || attribute.name === "style") {
        element.removeAttribute(attribute.name);
      }
      if (["href", "src"].includes(attribute.name)) {
        const value = attribute.value.trim();
        if (!/^(https?:|mailto:|#|\/|\.)/i.test(value)) {
          element.removeAttribute(attribute.name);
        }
      }
    }
    if (/^H[1-6]$/.test(element.tagName)) {
      const idSource = (element.textContent ?? "").trim().toLowerCase();
      if (idSource) element.id = idSource.replaceAll(/\s+/g, "-");
    }
  }
  return doc.body.innerHTML;
}

export const Markdown = forwardRef<
  HTMLDivElement,
  {
    children: string;
    density?: string;
    className?: string;
    components?: Record<string, unknown>;
    onLinkClick?: (href: string) => void | false;
  }
>(function Markdown({ children, density, className, onLinkClick }, ref) {
  const html = useMemo(() => sanitizeHtml(renderMarkdownHtml(children)), [children]);
  const localRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = localRef.current;
    if (!root || !onLinkClick) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (href == null) return;
      if (onLinkClick(href) === false) event.preventDefault();
    };
    root.addEventListener("click", handleClick);
    return () => root.removeEventListener("click", handleClick);
  }, [onLinkClick]);

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn(
        "max-w-none text-sm leading-7 text-app-ink [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-app-line [&_blockquote]:pl-4 [&_blockquote]:text-app-muted [&_code]:rounded [&_code]:bg-app-surface [&_code]:px-1 [&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:bg-app-surface [&_pre]:p-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-app-line [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-app-line [&_th]:bg-app-surface [&_th]:px-2 [&_th]:py-1.5 [&_ul]:list-disc [&_ul]:pl-5",
        density === "compact" && "text-xs leading-6",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export function ChatComposerInput() {
  return null;
}

export function ChatComposer({
  onSubmit,
  isDisabled,
  placeholder,
}: {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  placeholder?: string;
  input?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const next = value.trim();
    if (!next || isDisabled) return;
    onSubmit(next);
    setValue("");
  };
  return (
    <div className="flex items-end gap-2 rounded-xl border border-app-line bg-app-panel p-2">
      <textarea
        value={value}
        disabled={isDisabled}
        placeholder={placeholder}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-app-ink outline-none placeholder:text-app-muted"
      />
      <Button label="发送" variant="primary" size="sm" isDisabled={!value.trim() || isDisabled} onClick={submit} />
    </div>
  );
}

export function ChatMessageList({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

export function ChatMessage({
  sender,
  avatar,
  children,
}: {
  sender: "user" | "assistant";
  avatar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className={cn("flex gap-2", sender === "user" ? "justify-end" : "justify-start")}>
      {sender === "assistant" && avatar ? <div className="shrink-0 pt-1">{avatar}</div> : null}
      <div className={cn("min-w-0 max-w-[85%]", sender === "user" && "ml-auto")}>{children}</div>
    </article>
  );
}

export function ChatMessageBubble({
  variant = "default",
  metadata,
  children,
}: {
  variant?: "default" | "ghost";
  metadata?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2 text-sm leading-6",
        variant === "ghost" ? "bg-transparent text-app-ink" : "bg-app-surface text-app-ink",
      )}
    >
      {children}
      {metadata}
    </div>
  );
}

export function ChatMessageMetadata({
  timestamp,
  footer,
}: {
  timestamp?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-app-faint">
      {timestamp}
      {footer}
    </div>
  );
}

export function ChatToolCalls({
  calls,
  defaultIsExpanded,
}: {
  calls: Array<{ name: string; target: string; status: string }>;
  defaultIsExpanded?: boolean;
}) {
  return (
    <details open={defaultIsExpanded} className="mb-2 rounded-lg border border-app-line bg-app-panel px-3 py-2">
      <summary className="cursor-pointer text-xs text-app-muted">工具调用 · {calls.length}</summary>
      <ul className="mt-2 space-y-1">
        {calls.map((call, index) => (
          <li key={`${call.name}-${index}`} className="flex items-center justify-between gap-3 text-[11px] text-app-muted">
            <span>{call.name}</span>
            <span className="truncate text-app-faint">{call.target}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
