import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ children, className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    >
      {children}
    </table>
  )
}

export function TableHeader({ children, className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('border-b border-border bg-muted/40 [&_tr]:border-b-0', className)}
      {...props}
    >
      {children}
    </thead>
  )
}

export function TableBody({ children, className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-border/60', className)} {...props}>
      {children}
    </tbody>
  )
}

export function TableRow({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'transition-colors even:bg-muted/25 hover:bg-muted/35 data-[state=selected]:bg-muted',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TableHead({ children, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('px-4 py-2 text-left font-medium text-foreground', className)}
      {...props}
    >
      {children}
    </th>
  )
}

export function TableCell({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-2 text-sm text-foreground', className)} {...props}>
      {children}
    </td>
  )
}
