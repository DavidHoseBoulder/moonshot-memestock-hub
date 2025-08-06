
import { cn } from "@/lib/utils"

interface MainNavProps extends React.HTMLAttributes<HTMLDivElement> {}

export function MainNav({ className, ...props }: MainNavProps) {
  return (
    <div className={cn("flex items-center space-x-4 lg:space-x-6", className)} {...props}>
      <div className="font-bold text-lg">MemeTrader AI</div>
    </div>
  )
}
