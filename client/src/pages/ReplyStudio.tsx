import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import type { DraftReply, Conversation } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, Edit2, ExternalLink, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DraftCard({ draft, conversation, onApprove, onReject, isApproving, isRejecting }: {
  draft: DraftReply;
  conversation?: Conversation;
  onApprove: (id: string, content: string) => void;
  onReject: (id: string, note: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(draft.content);
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden" data-testid={`draft-card-${draft.id}`}>
      {/* Conversation context */}
      {conversation && (
        <div className="px-5 py-3 bg-muted/40 border-b border-border">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Re: {conversation.authorName} on {conversation.platform}
              </p>
              <p className="text-sm mt-0.5 line-clamp-2">{conversation.content}</p>
            </div>
            <a href={conversation.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground mt-1 shrink-0">
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      {/* Draft content */}
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Generated {timeAgo(draft.generatedAt)}</p>
            {draft.status !== "awaiting" && (
              <p className={cn("text-xs font-medium mt-0.5",
                draft.status === "approved" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}>
                {draft.status === "approved" ? "✓ Approved" : "✗ Rejected"}
                {draft.reviewedBy && ` by ${draft.reviewedBy}`}
              </p>
            )}
          </div>
          {draft.status === "awaiting" && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)} data-testid={`button-edit-draft-${draft.id}`}>
              <Edit2 size={14} className="mr-1" /> Edit
            </Button>
          )}
        </div>

        {editing ? (
          <Textarea
            value={editedContent}
            onChange={e => setEditedContent(e.target.value)}
            className="min-h-[100px] text-sm"
            data-testid={`textarea-draft-${draft.id}`}
          />
        ) : (
          <div className="text-sm leading-relaxed bg-muted/30 rounded-lg p-3 border border-border">
            {draft.content}
          </div>
        )}

        {/* Reject note form */}
        {showReject && (
          <div className="space-y-2">
            <Textarea
              placeholder="Reason for rejection (optional)"
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              className="text-sm min-h-[60px]"
              data-testid={`textarea-reject-note-${draft.id}`}
            />
          </div>
        )}

        {/* Action buttons (only for awaiting drafts) */}
        {draft.status === "awaiting" && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => onApprove(draft.id, editing ? editedContent : draft.content)}
              disabled={isApproving}
              data-testid={`button-approve-${draft.id}`}
            >
              <CheckCircle size={14} className="mr-1.5" />
              {isApproving ? "Approving…" : "Approve"}
            </Button>
            {showReject ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onReject(draft.id, rejectNote)}
                  disabled={isRejecting}
                  data-testid={`button-confirm-reject-${draft.id}`}
                >
                  {isRejecting ? "Rejecting…" : "Confirm Reject"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowReject(true)}
                data-testid={`button-reject-${draft.id}`}
              >
                <XCircle size={14} className="mr-1.5" /> Reject
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ReplyStudio() {
  const { toast } = useToast();

  const { data: drafts, isLoading: draftsLoading } = useQuery<DraftReply[]>({
    queryKey: ["/api/drafts"],
    queryFn: () => apiRequest("GET", "/api/drafts").then(r => r.json()),
  });

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: () => apiRequest("GET", "/api/conversations").then(r => r.json()),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiRequest("POST", `/api/drafts/${id}/approve`, { reviewedBy: "admin" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Reply approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiRequest("POST", `/api/drafts/${id}/reject`, { reviewedBy: "admin", note }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drafts"] });
      toast({ title: "Draft rejected" });
    },
  });

  const awaiting = (drafts ?? []).filter(d => d.status === "awaiting");
  const approved = (drafts ?? []).filter(d => d.status === "approved");
  const rejected = (drafts ?? []).filter(d => d.status === "rejected");

  const convMap = Object.fromEntries((conversations ?? []).map(c => [c.id, c]));

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Reply Studio</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review and approve AI-generated draft replies. AI never posts automatically.
        </p>
      </div>

      {/* Policy notice */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
        <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-amber-800 dark:text-amber-200">
          <strong>Non-Posting Policy:</strong> All AI replies must be approved by a team member. No automated posting occurs.
          Approved drafts must be manually published from your social media tools.
        </p>
      </div>

      <Tabs defaultValue="awaiting">
        <TabsList>
          <TabsTrigger value="awaiting" data-testid="tab-awaiting">
            Awaiting Review ({awaiting.length})
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            Approved ({approved.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">
            Rejected ({rejected.length})
          </TabsTrigger>
        </TabsList>

        {["awaiting","approved","rejected"].map(tab => {
          const subset = tab === "awaiting" ? awaiting : tab === "approved" ? approved : rejected;
          return (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-4">
              {draftsLoading ? (
                Array.from({length:2}).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
              ) : subset.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No {tab} drafts.
                </p>
              ) : subset.map(d => (
                <DraftCard
                  key={d.id}
                  draft={d}
                  conversation={convMap[d.conversationId]}
                  onApprove={(id, content) => approveMutation.mutate({ id, content })}
                  onReject={(id, note) => rejectMutation.mutate({ id, note })}
                  isApproving={approveMutation.isPending}
                  isRejecting={rejectMutation.isPending}
                />
              ))}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
