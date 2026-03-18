import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Forward, Send, AlertCircle } from "lucide-react";

interface ForwardModalProps {
  conversationId: string | null;
  authorName: string;
  platform: string;
  sentiment: string;
  onClose: () => void;
}

export function ForwardModal({
  conversationId,
  authorName,
  platform,
  sentiment,
  onClose,
}: ForwardModalProps) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const { toast } = useToast();

  const forwardMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/conversations/${conversationId}/forward`, {
        to: to.trim(),
        note: note.trim() || undefined,
      }).then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message ?? data.error ?? "Failed to forward");
        return data;
      }),
    onSuccess: () => {
      toast({
        title: "Conversation forwarded",
        description: `Sent to ${to.trim()}`,
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: "Could not send email",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  return (
    <Dialog open={!!conversationId} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Forward size={16} className="text-primary" />
            Forward Conversation
          </DialogTitle>
          <DialogDescription className="text-xs">
            Forward <span className="font-medium text-foreground">{authorName}</span> on{" "}
            <span className="font-medium text-foreground capitalize">{platform}</span> —{" "}
            <span className={`font-medium ${sentiment === "negative" ? "text-red-500" : sentiment === "positive" ? "text-emerald-600" : "text-muted-foreground"}`}>
              {sentiment} sentiment
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* To field */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">To</label>
            <Input
              type="email"
              placeholder="recipient@company.com"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="h-9 text-sm"
              data-testid="input-forward-to"
              autoFocus
            />
          </div>

          {/* Optional note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              placeholder="Add a note for the recipient..."
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground"
              data-testid="input-forward-note"
            />
          </div>

          {/* Preview note */}
          <div className="flex items-start gap-2 bg-muted/50 rounded-md px-3 py-2.5 border border-border">
            <AlertCircle size={13} className="text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-snug">
              The email will include the full conversation content, metadata, and any existing AI draft reply.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={forwardMutation.isPending}
              data-testid="button-forward-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => forwardMutation.mutate()}
              disabled={!isValid || forwardMutation.isPending}
              data-testid="button-forward-send"
            >
              <Send size={13} className="mr-1.5" />
              {forwardMutation.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
