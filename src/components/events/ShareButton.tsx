"use client";

import { Share2, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ShareButtonProps {
  title: string;
  url?: string;
  className?: string;
}

export function ShareButton({ title, url, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = url || window.location.href;

    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          url: shareUrl,
        });
        return;
      } catch (error) {
        // User cancelled or not supported, fall back to clipboard
        if ((error as Error).name === "AbortError") return;
      }
    }

    // Fall back to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={handleShare}
            className={className}
          >
            {copied ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            <span className="sr-only">Share event</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Share event</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
