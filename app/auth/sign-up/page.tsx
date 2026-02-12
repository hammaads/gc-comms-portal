import { SignUpForm } from "@/components/sign-up-form";
import { Moon } from "lucide-react";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/5 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Moon className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Grand Citizens</h1>
          <p className="text-sm text-muted-foreground">Volunteer Management</p>
        </div>
        <SignUpForm />
      </div>
    </div>
  );
}
