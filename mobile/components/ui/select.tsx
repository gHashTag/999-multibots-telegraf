import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "../../lib/utils"

interface SelectProps {
  children: React.ReactNode
  value?: string
  onValueChange?: (value: string) => void
  defaultValue?: string
}

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  children: React.ReactNode
}

interface SelectContentProps {
  children: React.ReactNode
  className?: string
}

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  children: React.ReactNode
}

interface SelectValueProps {
  placeholder?: string
  className?: string
}

const SelectContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({});

const Select: React.FC<SelectProps> = ({ children, value, onValueChange, defaultValue }) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue || '')
  const currentValue = value !== undefined ? value : internalValue

  const handleValueChange = (newValue: string) => {
    if (value === undefined) {
      setInternalValue(newValue)
    }
    onValueChange?.(newValue)
  }

  return (
    <SelectContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  )
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )
)
SelectTrigger.displayName = "SelectTrigger"

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
)
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, value, onClick, ...props }, ref) => {
    const context = React.useContext(SelectContext)

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      context.onValueChange?.(value)
      onClick?.(e)
    }

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
          className
        )}
        onClick={handleClick}
        {...props}
      >
        {children}
      </div>
    )
  }
)
SelectItem.displayName = "SelectItem"

const SelectValue: React.FC<SelectValueProps> = ({ placeholder, className }) => {
  const context = React.useContext(SelectContext)
  return (
    <span className={cn("block truncate", className)}>
      {context.value || placeholder}
    </span>
  )
}

const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)}
    {...props}
  />
))
SelectLabel.displayName = "SelectLabel"

const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = "SelectSeparator"

// For compatibility
const SelectGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>
const SelectScrollUpButton: React.FC = () => null
const SelectScrollDownButton: React.FC = () => null

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
