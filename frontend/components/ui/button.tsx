import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Buttons follow the Spectra reference: pill geometry, small tight-tracked
 * labels, and an ember accent that carries near-black text rather than white.
 * Existing `variant`/`size` names are preserved so no call site has to change.
 */
const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center",
    "rounded-pill border border-transparent bg-clip-padding",
    "text-sm font-medium tracking-[-0.01em] whitespace-nowrap",
    "transition-[background,color,box-shadow,transform] duration-200 ease-out",
    "outline-none select-none",
    "focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-ring",
    // Weight: buttons sit on the page and depress when pressed. Lifting on
    // hover and collapsing the shadow on :active is what makes them feel solid
    // rather than painted on.
    "hover:-translate-y-px active:translate-y-0 active:shadow-none",
    "disabled:pointer-events-none disabled:opacity-45",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        // Azure — the analytical primary.
        default:
          "weight-brand bg-primary text-primary-foreground hover:brightness-110",
        // Ember — the reference's signature CTA: hot accent, ink label.
        ember:
          "weight-ember bg-ember-500 text-[#050505] hover:bg-ember-400",
        // Inverted pill — white on ink / ink on paper, as used in the hero.
        contrast: "weight bg-foreground text-background hover:opacity-90",
        // The reference's white pill: solid surface, hard edge, real shadow.
        outline:
          "weight border-border bg-card hover:bg-card hover:border-foreground/25 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
        secondary:
          "weight bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]",
        // Ghost stays flat — it is the one control without weight, by design.
        ghost:
          "hover:translate-y-0 hover:bg-muted hover:text-foreground aria-expanded:bg-muted dark:hover:bg-white/[0.06]",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/30 dark:bg-destructive/15 dark:hover:bg-destructive/25",
        link: "rounded-none hover:translate-y-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Asymmetric padding mirrors the reference, where the icon sits tight
        // to one edge and the label breathes on the other.
        default:
          "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2.5 text-[11px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-6 text-[0.9375rem]",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/** Public prop type — kokonutui components extend this. */
export type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants>

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
