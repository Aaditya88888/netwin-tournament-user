import React from "react";
import { useState } from "react";
import { Match, TeamMember } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import ScreenshotUploadSimple from "./ScreenshotUploadSimple";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, ShieldAlert, Upload, CheckCircle, Loader2, Clock, Skull, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { GeminiService, ScreenshotAnalysisResult } from "@/lib/geminiService";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface MatchResultsProps {
  match: Match;
  onUploadResult?: (matchId: string, screenshot: string, kills?: number, placement?: number) => Promise<boolean>;
}

const MatchResults = ({ match, onUploadResult }: MatchResultsProps) => {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [uploadedScreenshot, setUploadedScreenshot] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<ScreenshotAnalysisResult | null>(null);
  const [extractedData, setExtractedData] = useState<{ kills: number; position: number }>({
    kills: 0,
    position: 0
  });

  const handleScreenshotUpload = async (screenshot: string) => {
    console.log("[MatchResults] Screenshot uploaded:", screenshot.substring(0, 50) + "...");
    setUploadedScreenshot(screenshot);
    setAiAnalysis(null);

    // Trigger AI Analysis
    setIsAnalyzing(true);
    try {
      const analysis = await GeminiService.analyzeScreenshot(screenshot);
      setAiAnalysis(analysis);

      if (analysis.success) {
        setExtractedData({
          kills: analysis.kills,
          position: analysis.position
        });

        if (!analysis.isAuthentic) {
          toast({
            title: "Verification Warning",
            description: "AI detected potential tampering. Please ensure you upload the original game result screen.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("[MatchResults] AI Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmitResult = async () => {
    if (!onUploadResult || !uploadedScreenshot) {
      console.error("[MatchResults] Cannot submit: missing upload handler or screenshot");
      return;
    }

    setUploading(true);
    try {
      // Pass the screenshot along with AI detected kills and position
      const success = await onUploadResult(
        match.id,
        uploadedScreenshot,
        extractedData.kills || undefined,
        extractedData.position || undefined
      );
      if (success) {
        setUploadDialogOpen(false);
        setUploadedScreenshot(null);
        toast({
          title: "Result Submitted",
          description: "Your match result has been submitted successfully and is awaiting admin review.",
        });
      } else {
        toast({
          title: "Submission Failed",
          description: "Failed to submit your match result. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("[MatchResults] Error submitting result:", error);
      toast({
        title: "Submission Error",
        description: "An error occurred while submitting your result. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleViewScreenshot = (screenshot: string) => {
    setPreviewImage(screenshot);
  };

  if (!user) return null;

  const isOwner = match.teamMembers.some(member => {
    interface ExtendedTeamMember extends TeamMember {
      userId?: string;
      gameId?: string;
    }
    const extendedMember = member as ExtendedTeamMember;
    const memberId = extendedMember.id || extendedMember.userId || extendedMember.username;
    const userMatches = memberId === userProfile?.uid ||
      memberId === userProfile?.username ||
      extendedMember.username === userProfile?.username ||
      extendedMember.gameId === userProfile?.gameId;
    return userMatches && extendedMember.isOwner;
  });
  const canUploadResult = isOwner && !match.resultSubmitted && match.status === "completed";
  const isPendingApproval = match.resultSubmitted && !match.resultApproved;
  const isApproved = match.resultApproved;

  console.log("[MatchResults Debug] Full Data:", {
    matchId: match.id,
    matchStatus: match.status,
    resultSubmitted: match.resultSubmitted,
    resultApproved: match.resultApproved,
    isOwner,
    canUploadResult,
    userProfileUid: userProfile?.uid,
    teamMembers: match.teamMembers.map(m => ({
      id: m.id,
      userId: (m as TeamMember & { userId?: string }).userId,
      username: m.username,
      isOwner: m.isOwner,
      matchesUserUid: m.id === userProfile?.uid,
      matchesUserUidViaUserId: (m as TeamMember & { userId?: string }).userId === userProfile?.uid
    }))
  });

  // Additional debug for canUploadResult
  return (
    <div className="bg-dark-card rounded-xl overflow-hidden border border-gray-800">
      { }
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-900 bg-opacity-20 border border-yellow-700 p-4 rounded-lg mb-4">
          <h4 className="font-semibold text-yellow-400 mb-2">Debug Info</h4>
          <pre className="text-xs text-yellow-300 overflow-auto">
            {JSON.stringify({
              matchId: match.id,
              status: match.status,
              resultSubmitted: match.resultSubmitted,
              resultApproved: match.resultApproved,
              teamMembers: match.teamMembers,
              userProfile: userProfile ? { uid: userProfile.uid, username: userProfile.username } : null,
              isOwner,
              canUploadResult
            }, null, 2)}
          </pre>
        </div>
      )}

      {/* Match Result Header */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold font-poppins">{match.tournamentTitle}</h3>

          <div className="flex items-center gap-2">
            {match.status === "completed" && (
              <>
                {isApproved ? (
                  <Badge variant="outline" className="bg-green-900 bg-opacity-20 border-green-700 text-green-400">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                ) : match.resultSubmitted ? (
                  <Badge variant="outline" className="bg-yellow-900 bg-opacity-20 border-yellow-700 text-yellow-400">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending Approval
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-900 bg-opacity-20 border-red-700 text-red-400">
                    <ShieldAlert className="h-3 w-3 mr-1" />
                    Result Required
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Match Performance Summary */}
      <div className="p-6">
        {/* Show verified results notification if available */}
        {match.status === "completed" && (match as Match & { resultVerified?: boolean }).resultVerified && (
          <div className="mb-4 p-3 bg-green-900/20 border border-green-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className="text-green-400 font-medium">Results Verified</span>
            </div>
            <p className="text-sm text-gray-300">
              Your tournament results have been verified by the admin.
            </p>
          </div>
        )}

        {match.status === "completed" ? (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-dark-lighter p-4 rounded-lg text-center">
              <div className="text-xs text-gray-400 mb-1">Position</div>
              {match.position ? (
                <div className="text-xl font-rajdhani font-bold">
                  {match.position === 1 ? (
                    <span className="text-yellow-400">#1</span>
                  ) : match.position <= 3 ? (
                    <span className="text-amber-500">#{match.position}</span>
                  ) : (
                    <span>#{match.position}</span>
                  )}
                </div>
              ) : (
                <div className="text-gray-500">--</div>
              )}
            </div>

            <div className="bg-dark-lighter p-4 rounded-lg text-center">
              <div className="text-xs text-gray-400 mb-1">Team Kills</div>
              {match.teamMembers.some(member => typeof member.kills === 'number') ? (
                <div className="text-xl font-rajdhani font-bold">
                  {match.teamMembers.reduce((total, member) => total + (member.kills || 0), 0)}
                </div>
              ) : (
                <div className="text-gray-500">--</div>
              )}
            </div>

            <div className="bg-dark-lighter p-4 rounded-lg text-center">
              <div className="text-xs text-gray-400 mb-1">Prize</div>
              {match.prize ? (
                <div className="text-xl font-rajdhani font-bold text-green-400">
                  {formatCurrency(match.prize || 0, userProfile?.currency || "INR")}
                </div>
              ) : (
                <div className="text-gray-500">--</div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-dark-lighter p-4 rounded-lg text-center mb-6">
            <div className="text-gray-400">
              Match results will be available once the match is completed.
            </div>
          </div>
        )}

        {/* Team Performance */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="team" className="border-gray-800">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <span className="font-medium">Team Performance</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pt-2">
                {match.teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 bg-dark-lighter p-3 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {member.username}
                        {member.isOwner && (
                          <span className="text-xs bg-primary bg-opacity-20 text-primary px-1.5 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">ID: {member.inGameId}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {typeof member.kills === 'number' ? (
                        <div className="flex items-center gap-1 text-red-400">
                          <Skull className="h-4 w-4" />
                          <span className="font-rajdhani font-bold">{member.kills}</span>
                        </div>
                      ) : (
                        <div className="text-gray-500">--</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Result Screenshot */}
        {match.resultScreenshot && (
          <div className="mt-6">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              Result Screenshot
            </h4>
            <div className="cursor-pointer" onClick={() => handleViewScreenshot(match.resultScreenshot!)}>
              <img
                src={match.resultScreenshot}
                alt="Match Result"
                className="w-full rounded-lg border border-gray-800 hover:opacity-90 transition"
              />
            </div>
          </div>
        )}
        {/* Upload Result Button for team owner */}
        {canUploadResult && (
          <div className="mt-6 flex justify-center">
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-secondary">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Match Result
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-dark-card text-white border-gray-800 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Upload Match Result</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Upload a screenshot of your match result screen. The admin will review and enter your position and kills manually.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">                  {/* Screenshot Upload */}
                  <div>
                    <Label>Match Result Screenshot</Label>
                    <ScreenshotUploadSimple
                      onUpload={handleScreenshotUpload}
                      preview={uploadedScreenshot}
                      isUploading={uploading || isAnalyzing}
                      disabled={uploading || isAnalyzing}
                    />
                  </div>

                  {isAnalyzing && (
                    <div className="flex items-center justify-center p-4 bg-purple-900/10 border border-purple-500/30 rounded-lg animate-pulse">
                      <Sparkles className="h-5 w-5 text-purple-400 mr-2 animate-spin" />
                      <span className="text-purple-400 text-sm font-medium">AI is analyzing screenshot...</span>
                    </div>
                  )}

                  {aiAnalysis && aiAnalysis.success && (
                    <div className="space-y-4">
                      <Alert variant={aiAnalysis.isAuthentic ? "default" : "destructive"} className={aiAnalysis.isAuthentic ? "bg-green-900/10 border-green-500/30" : ""}>
                        {aiAnalysis.isAuthentic ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        <AlertTitle>{aiAnalysis.isAuthentic ? "AI Verified" : "Verification Failed"}</AlertTitle>
                        <AlertDescription className="text-xs">
                          {aiAnalysis.reasoning || (aiAnalysis.isAuthentic
                            ? "Screenshot appears authentic. Data extracted automatically."
                            : "This screenshot might be edited or invalid.")}
                        </AlertDescription>
                      </Alert>

                      {aiAnalysis.isAuthentic && (
                        <div className="grid grid-cols-2 gap-4 bg-dark-lighter p-3 rounded-lg border border-gray-800">
                          <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Detected Kills</div>
                            <div className="text-lg font-bold text-red-400 flex items-center justify-center gap-1">
                              <Skull className="h-4 w-4" />
                              {aiAnalysis.kills}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Detected Position</div>
                            <div className="text-lg font-bold text-yellow-400 flex items-center justify-center gap-1">
                              <Trophy className="h-4 w-4" />
                              #{aiAnalysis.position}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <DialogFooter className="sm:justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setUploadDialogOpen(false)}
                    disabled={uploading}
                    className="border-gray-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitResult}
                    disabled={uploading || !uploadedScreenshot}
                    className="bg-gradient-to-r from-primary to-secondary"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Submit Result
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Status message for non-owners */}
        {match.status === "completed" && !isOwner && !match.resultSubmitted && (
          <div className="mt-6 text-center text-gray-400">
            Waiting for team owner to submit match result.
          </div>
        )}

        {/* Result pending message */}
        {isPendingApproval && (
          <div className="mt-6 p-4 bg-yellow-900 bg-opacity-10 border border-yellow-900 text-yellow-400 rounded-lg text-center">
            <Clock className="h-5 w-5 mx-auto mb-2" />
            <p>Your match result has been submitted and is awaiting admin approval.</p>
          </div>
        )}

        {/* Result approved message */}
        {isApproved && (
          <div className="mt-6 p-4 bg-green-900 bg-opacity-10 border border-green-900 text-green-400 rounded-lg text-center">
            <CheckCircle className="h-5 w-5 mx-auto mb-2" />
            <p>Your match result has been verified and rewards have been processed.</p>
          </div>
        )}      </div>

      {/* Preview Image Dialog */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="bg-dark-card text-white border-gray-800 sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Match Result</DialogTitle>
            </DialogHeader>
            <div className="w-full">
              <img
                src={previewImage}
                alt="Match Result"
                className="w-full rounded-lg border border-gray-800"
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => setPreviewImage(null)}
                className="border-gray-700"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default MatchResults;
