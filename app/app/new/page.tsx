import { AppLayout } from "@/components/app-layout"
import { PromptInput } from "@/components/prompt-input"
import { Button } from "@/components/ui/button"
import { Search, Building2, TrendingDown, HeartHandshake } from "lucide-react"

export default function NewPage() {
  return (
    <AppLayout>
      <div className="flex flex-1 flex-col items-center justify-center p-4 md:p-8">
        <div className="flex w-full max-w-2xl flex-col items-center">
          {/* Big headline with magnifying glass icon on the left */}
          <div className="mb-5 flex items-center gap-3 text-center sm:mb-6">
            <Search className="size-7 text-muted-foreground sm:size-8" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              What would you like to know?
            </h1>
          </div>

          {/* Prompt input container */}
          <div className="w-full">
            <PromptInput />
          </div>

          {/* Three buttons grouped and centered below prompt input (larger size) */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <Building2 className="size-4" />
              <span>District Profile</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <TrendingDown className="size-4" />
              <span>Poverty Rates</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <HeartHandshake className="size-4" />
              <span>Public Programs</span>
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
