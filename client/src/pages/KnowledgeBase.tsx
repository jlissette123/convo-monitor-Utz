import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import type { KnowledgeEntry } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["Brand Story", "Sustainability", "Product Facts", "Response Templates", "Crisis Management", "Competitors", "Other"];

function EntryCard({ entry, onEdit, onDelete }: {
  entry: KnowledgeEntry;
  onEdit: (e: KnowledgeEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 space-y-3 shadow-sm" data-testid={`knowledge-card-${entry.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-xs shrink-0">{entry.category}</Badge>
          </div>
          <h3 className="text-sm font-semibold">{entry.title}</h3>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(entry)} data-testid={`button-edit-entry-${entry.id}`}>
            <Pencil size={13} />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(entry.id)} data-testid={`button-delete-entry-${entry.id}`}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{entry.content}</p>
      {(entry.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
        </div>
      )}
    </div>
  );
}

export function KnowledgeBase() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [form, setForm] = useState({ title: "", category: CATEGORIES[0], content: "", tags: "" });

  const { data: entries, isLoading } = useQuery<KnowledgeEntry[]>({
    queryKey: ["/api/knowledge"],
    queryFn: () => apiRequest("GET", "/api/knowledge").then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/knowledge", body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      setDialogOpen(false);
      toast({ title: "Entry created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest("PATCH", `/api/knowledge/${id}`, body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      setDialogOpen(false);
      toast({ title: "Entry updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/knowledge/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      toast({ title: "Entry deleted" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", category: CATEGORIES[0], content: "", tags: "" });
    setDialogOpen(true);
  };
  const openEdit = (e: KnowledgeEntry) => {
    setEditing(e);
    setForm({ title: e.title, category: e.category, content: e.content, tags: (e.tags ?? []).join(", ") });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload = {
      ...form,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      id: editing?.id ?? `k-${Date.now()}`,
    };
    if (editing) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = (entries ?? []).filter(e => {
    if (catFilter !== "all" && e.category !== catFilter) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categories = [...new Set((entries ?? []).map(e => e.category))];

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Brand facts, response templates, and messaging guidelines</p>
        </div>
        <Button size="sm" onClick={openCreate} data-testid="button-create-entry">
          <Plus size={14} className="mr-1.5" /> New Entry
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search entries…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-kb-search"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["all", ...categories].map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${catFilter === cat ? "bg-primary text-primary-foreground border-transparent" : "bg-background text-muted-foreground border-border hover:bg-accent"}`}
              data-testid={`filter-${cat}`}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length: 6}).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No entries found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(e => (
            <EntryCard key={e.id} entry={e} onEdit={openEdit} onDelete={(id) => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Entry" : "New Knowledge Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
              <Input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Entry title" data-testid="input-entry-title" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <select
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                value={form.category}
                onChange={e => setForm(f => ({...f, category: e.target.value}))}
                data-testid="select-entry-category"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Content</label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({...f, content: e.target.value}))}
                placeholder="Entry content…"
                className="min-h-[120px] text-sm"
                data-testid="textarea-entry-content"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags (comma separated)</label>
              <Input value={form.tags} onChange={e => setForm(f => ({...f, tags: e.target.value}))} placeholder="tag1, tag2, tag3" data-testid="input-entry-tags" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-entry">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
