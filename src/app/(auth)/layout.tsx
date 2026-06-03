export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-blue-50 to-slate-100 p-4 dark:from-indigo-950 dark:via-blue-950 dark:to-slate-900">
      {children}
    </div>
  )
}
