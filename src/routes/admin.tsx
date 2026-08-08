import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UAE_CITIES, formatWhen, type Listing, type ListingKind } from "@/lib/listings";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Add a movie or event | ShowSouk" },
      {
        name: "description",
        content:
          "Publish a new cinema release or live event to the ShowSouk listings across the Emirates.",
      },
      { property: "og:title", content: "Add a movie or event | ShowSouk" },
      {
        property: "og:description",
        content: "Publish your own UAE movie or event listing in seconds.",
      },
    ],
  }),
  component: AdminPage,
});

const schema = z.object({
  title: z.string().trim().min(2, "Title is required").max(120),
  description: z.string().trim().max(1500).optional(),
  poster_url: z.string().trim().url("Poster must be a valid URL").max(500).or(z.literal("")),
  genre: z.string().trim().max(60),
  language: z.string().trim().max(60),
  venue: z.string().trim().max(120),
  price_aed: z.number().min(0).max(100000),
  duration_mins: z.number().int().min(0).max(1000),
  certification: z.string().trim().max(30),
});

const empty = {
  kind: "movie" as ListingKind,
  title: "",
  description: "",
  poster_url: "",
  genre: "",
  language: "English",
  venue: "",
  city: "Dubai",
  price_aed: "",
  starts_at: "",
  duration_mins: "",
  certification: "",
};

function AdminPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  const { data: mine } = useQuery({
    queryKey: ["my-listings", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Listing[]> => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Listing[];
    },
  });

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({
      title: form.title,
      description: form.description,
      poster_url: form.poster_url,
      genre: form.genre,
      language: form.language,
      venue: form.venue,
      price_aed: Number(form.price_aed || 0),
      duration_mins: Number(form.duration_mins || 0),
      certification: form.certification,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("listings").insert({
      kind: form.kind,
      title: parsed.data.title,
      description: parsed.data.description || null,
      poster_url: parsed.data.poster_url || null,
      genre: parsed.data.genre || null,
      language: parsed.data.language || null,
      venue: parsed.data.venue || null,
      city: form.city,
      price_aed: parsed.data.price_aed,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      duration_mins: parsed.data.duration_mins || null,
      certification: parsed.data.certification || null,
      created_by: user.id,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${form.kind === "movie" ? "Movie" : "Event"} published`);
    setForm(empty);
    queryClient.invalidateQueries({ queryKey: ["listings"] });
    queryClient.invalidateQueries({ queryKey: ["my-listings"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Listing removed");
    queryClient.invalidateQueries({ queryKey: ["listings"] });
    queryClient.invalidateQueries({ queryKey: ["my-listings"] });
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-4 py-20 text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-3xl font-bold">Sign in to add listings</h1>
        <p className="mt-3 text-muted-foreground">
          Publishing movies and events requires a ShowSouk account.
        </p>
        <Button asChild variant="hero" className="mt-6">
          <Link to="/auth">Sign in or sign up</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-bold">Add a movie or event</h1>
      <p className="mt-2 text-muted-foreground">
        Your listing goes live on ShowSouk the moment you publish it.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 grid gap-5 rounded-xl border border-border bg-card p-6 sm:grid-cols-2"
      >
        <Field label="Type">
          <Select value={form.kind} onValueChange={(v) => set("kind", v as ListingKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="movie">Movie</SelectItem>
              <SelectItem value="event">Event</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="City">
          <Select value={form.city} onValueChange={(v) => set("city", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UAE_CITIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Title" full>
          <Input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={120}
            required
          />
        </Field>

        <Field label="Description" full>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={1500}
            rows={4}
          />
        </Field>

        <Field label="Poster image URL" full>
          <Input
            value={form.poster_url}
            onChange={(e) => set("poster_url", e.target.value)}
            placeholder="https://…"
            maxLength={500}
          />
        </Field>

        <Field label="Venue">
          <Input
            value={form.venue}
            onChange={(e) => set("venue", e.target.value)}
            placeholder="VOX Cinemas, Mall of the Emirates"
            maxLength={120}
          />
        </Field>

        <Field label="Genre / Category">
          <Input value={form.genre} onChange={(e) => set("genre", e.target.value)} maxLength={60} />
        </Field>

        <Field label="Language">
          <Input
            value={form.language}
            onChange={(e) => set("language", e.target.value)}
            maxLength={60}
          />
        </Field>

        <Field label="Certification / Age">
          <Input
            value={form.certification}
            onChange={(e) => set("certification", e.target.value)}
            placeholder="PG-15"
            maxLength={30}
          />
        </Field>

        <Field label="Starts at">
          <Input
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => set("starts_at", e.target.value)}
          />
        </Field>

        <Field label="Duration (minutes)">
          <Input
            type="number"
            min={0}
            max={1000}
            value={form.duration_mins}
            onChange={(e) => set("duration_mins", e.target.value)}
          />
        </Field>

        <Field label="Ticket price (AED)">
          <Input
            type="number"
            min={0}
            step="1"
            value={form.price_aed}
            onChange={(e) => set("price_aed", e.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Button type="submit" variant="hero" size="lg" disabled={busy}>
            {busy ? "Publishing…" : "Publish listing"}
          </Button>
        </div>
      </form>

      <section className="mt-14">
        <h2 className="text-2xl font-bold">Your listings</h2>
        <div className="mt-4 space-y-3">
          {(mine ?? []).map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <Link
                  to="/listing/$id"
                  params={{ id: l.id }}
                  className="font-semibold hover:text-gold"
                >
                  {l.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {l.kind} · {l.city} · {formatWhen(l.starts_at)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${l.title}`}
                className="ml-auto text-destructive"
                onClick={() => remove(l.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {(mine ?? []).length === 0 ? (
            <p className="text-muted-foreground">You haven't published anything yet.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`space-y-2 ${full ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
