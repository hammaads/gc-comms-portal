import Link from "next/link";
import { Moon, Users, CalendarDays, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/5">
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          {/* Brand icon */}
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-sm">
            <Moon className="h-8 w-8 text-primary" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Grand Citizens
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Volunteer management platform for Iftaar Drives in Karachi.
            Coordinate duties, track attendance, and make every drive count.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/volunteer/register">
              <Button size="lg" className="w-full sm:w-auto">
                Volunteer Sign-Up
              </Button>
            </Link>
            <Link href="/drives">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Admin Dashboard
              </Button>
            </Link>
          </div>

          {/* Feature highlights */}
          <div className="mt-16 grid w-full gap-4 sm:grid-cols-3">
            {[
              {
                icon: CalendarDays,
                title: "Drive Planning",
                desc: "Schedule & manage iftaar drives with smart duty assignment",
              },
              {
                icon: Users,
                title: "Volunteer Ops",
                desc: "Track attendance, send reminders, manage waitlists",
              },
              {
                icon: BarChart3,
                title: "Analytics",
                desc: "Real-time dashboards, leaderboards & performance insights",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border bg-card/50 p-5 text-left backdrop-blur-sm"
              >
                <feature.icon className="mb-2 h-5 w-5 text-primary" />
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
