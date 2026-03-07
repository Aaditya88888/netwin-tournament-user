import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Camera, Trophy, Loader2, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import ScreenshotUploadSimple from "./ScreenshotUploadSimple";
import { GeminiService, ScreenshotAnalysisResult } from "@/lib/geminiService";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PostTournamentResultProps {
  tournamentTitle: string;
  isCompleted: boolean;
  hasSubmittedResult: boolean;
  onResultSubmit: (screenshot: string, kills: number, position: number) => Promise<boolean>;
}

export default function PostTournamentResult({
  tournamentTitle,
  isCompleted,
  hasSubmittedResult,
  onResultSubmit
}: PostTournamentResultProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<ScreenshotAnalysisResult | null>(null);
  const [resultData, setResultData] = useState({
    kills: 0,
    position: 1,
  });
  const { toast } = useToast();
  const { userProfile } = useAuth();

  const handleScreenshotUpload = async (screenshotUrl: string) => {
    setScreenshot(screenshotUrl);
    setAiAnalysis(null);

    // Trigger AI Analysis
    setIsAnalyzing(true);
    try {
      const analysis = await GeminiService.analyzeScreenshot(screenshotUrl);
      setAiAnalysis(analysis);

      if (analysis.success) {
        setResultData({
          kills: analysis.kills,
          position: analysis.position > 0 ? analysis.position : resultData.position
        });

        if (!analysis.isAuthentic) {
          toast({
            title: "Verification Warning",
            description: "AI detected potential tampering or an invalid screenshot. Please ensure you upload the original game result.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "AI Analysis Complete",
            description: `Detected ${analysis.kills} kills and #${analysis.position} position.`,
          });
        }
      }
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    if (!screenshot) {
      toast({
        title: "Screenshot Required",
        description: "Please upload a screenshot of your result",
        variant: "destructive",
      });
      return;
    }

    if (!userProfile) {
      toast({
        title: "Authentication Required",
        description: "Please log in to submit results",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const success = await onResultSubmit(screenshot, resultData.kills, resultData.position);
      if (success) {
        setDialogOpen(false);
        setScreenshot(null);
        setResultData({ kills: 0, position: 1 });
        toast({
          title: "Result Submitted",
          description: "Your tournament result has been submitted successfully",
        });
      } else {
        toast({
          title: "Submission Failed",
          description: "Failed to submit your result. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error submitting result:", error);
      toast({
        title: "Error",
        description: "An error occurred while submitting your result",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  // Don't show anything if tournament is not completed
  if (!isCompleted) {
    return null;
  }

  return (
    <Card className="bg-dark-card border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5" />
          Tournament Results
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasSubmittedResult ? (
          <div className="text-center p-4 bg-green-900/20 border border-green-700 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Trophy className="h-5 w-5 text-green-400" />
              <span className="text-green-400 font-medium">Result Submitted</span>
            </div>
            <p className="text-sm text-gray-300">
              Your tournament result has been submitted and is awaiting verification.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Camera className="h-5 w-5 text-blue-400" />
                <span className="text-blue-400 font-medium">Submit Your Result</span>
              </div>
              <p className="text-sm text-gray-300 mb-4">
                Upload a screenshot of your final result to receive your rewards
              </p>

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                    <Upload className="h-4 w-4 mr-2" />
                    Submit Result
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-dark-card text-white border-gray-800 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5" />
                      Submit Tournament Result
                    </DialogTitle>
                    <div className="text-sm text-gray-400 mt-1">
                      Provide your match result details and upload a screenshot for verification.
                    </div>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="text-sm text-gray-300 bg-gray-800 p-3 rounded-lg">
                      <div className="font-medium mb-1">Tournament: {tournamentTitle}</div>
                      <div className="text-xs text-gray-400">
                        Upload a clear screenshot showing your final position and kills
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Result Screenshot</Label>
                      <ScreenshotUploadSimple
                        onUpload={handleScreenshotUpload}
                        preview={screenshot}
                      />
                    </div>

                    {isAnalyzing && (
                      <div className="flex items-center justify-center p-4 bg-purple-900/10 border border-purple-500/30 rounded-lg animate-pulse">
                        <Sparkles className="h-5 w-5 text-purple-400 mr-2 animate-spin" />
                        <span className="text-purple-400 text-sm font-medium">AI is analyzing screenshot...</span>
                      </div>
                    )}

                    {aiAnalysis && aiAnalysis.success && (
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
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="kills" className="text-sm font-medium flex items-center gap-1">
                          Total Kills
                          {aiAnalysis?.success && aiAnalysis.isAuthentic && (
                            <Sparkles className="h-3 w-3 text-purple-400" title="Detected by AI" />
                          )}
                        </Label>
                        <Input
                          id="kills"
                          type="number"
                          min="0"
                          max="50"
                          value={resultData.kills}
                          onChange={(e) => setResultData({
                            ...resultData,
                            kills: Math.max(0, parseInt(e.target.value) || 0)
                          })}
                          className="bg-gray-800 border-gray-700"
                        />
                      </div>
                      <div>
                        <Label htmlFor="position" className="text-sm font-medium flex items-center gap-1">
                          Final Position
                          {aiAnalysis?.success && aiAnalysis.isAuthentic && (
                            <Sparkles className="h-3 w-3 text-purple-400" title="Detected by AI" />
                          )}
                        </Label>
                        <Input
                          id="position"
                          type="number"
                          min="1"
                          max="100"
                          value={resultData.position}
                          onChange={(e) => setResultData({
                            ...resultData,
                            position: Math.max(1, parseInt(e.target.value) || 1)
                          })}
                          className="bg-gray-800 border-gray-700"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                        className="border-gray-700"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSubmit}
                        disabled={uploading || !screenshot}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Submit Result
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
