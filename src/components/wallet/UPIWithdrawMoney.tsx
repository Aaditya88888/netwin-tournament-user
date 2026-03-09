import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { UPIWalletService } from "@/lib/upiWalletService";
import { validateUPIId } from "@/utils/upiUtils";
import { PendingWithdrawal } from "@/types/wallet-requests";
import { ArrowUpRight, AlertCircle, CheckCircle, Clock, X, Info, IndianRupee, Copy, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const withdrawalSchema = z.object({
  amount: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number().min(10, "Minimum withdrawal is ₹10").max(100000, "Maximum withdrawal is ₹100,000")
  ),
  upiId: z.string().min(3, "Please enter a valid UPI ID").refine(validateUPIId, "Invalid UPI ID format"),
  saveUpiId: z.boolean().default(false),
});

type WithdrawalFormValues = z.infer<typeof withdrawalSchema>;

interface UPIWithdrawMoneyProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const UPIWithdrawMoney = ({ onClose, onSuccess }: UPIWithdrawMoneyProps) => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [withdrawalRequests, setWithdrawalRequests] = useState<PendingWithdrawal[]>([]);
  const [savedUpiIds, setSavedUpiIds] = useState<string[]>([]);
  const [withdrawAmount, setWithdrawAmount] = useState(0);

  const form = useForm<WithdrawalFormValues>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      amount: undefined,
      upiId: "",
      saveUpiId: false,
    },
  });

  // Quick amounts
  const quickAmounts = [100, 500, 1000, 2000, 5000];

  // Load user withdrawal requests and saved UPI IDs
  useEffect(() => {
    const loadData = async () => {
      if (!userProfile) return;

      try {
        const [requests, upiIds] = await Promise.all([
          UPIWalletService.getUserWithdrawalRequests(userProfile.uid),
          UPIWalletService.getUserSavedUpiIds(userProfile.uid)
        ]);

        setWithdrawalRequests(requests);
        setSavedUpiIds(upiIds);
      } catch (error) {
        console.error('Error loading withdrawal data:', error);
      }
    };

    loadData();
  }, [userProfile]);

  // Handle copy UPI ID
  const handleCopyUpi = (upiId: string) => {
    navigator.clipboard.writeText(upiId);
    toast({
      title: "Copied!",
      description: "UPI ID copied to clipboard",
    });
  };

  // Handle use saved UPI ID
  const handleUseSavedUpi = (upiId: string) => {
    form.setValue('upiId', upiId);
  };

  // Handle delete saved UPI ID
  const handleDeleteSavedUpi = async (upiId: string) => {
    try {
      if (!userProfile) return;

      await UPIWalletService.deleteSavedUpiId(userProfile.uid, upiId);
      setSavedUpiIds(prev => prev.filter(id => id !== upiId));

      toast({
        title: "UPI ID Deleted",
        description: "Saved UPI ID has been removed",
      });
    } catch (error) {
      console.error('Error deleting UPI ID:', error);
      toast({
        title: "Error",
        description: "Failed to delete UPI ID",
        variant: "destructive",
      });
    }
  };

  // Replace all lowercase KYC status string comparisons/assignments with uppercase enum values
  const isKycApproved = (status: string) => status?.toUpperCase() === "APPROVED" || status?.toUpperCase() === "VERIFIED";

  // Handle form submission
  const onSubmit = async (data: WithdrawalFormValues) => {
    if (!userProfile) {
      toast({
        title: "Error",
        description: "User profile not found. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    // Check KYC status
    if (!isKycApproved(userProfile.kycStatus)) {
      toast({
        title: "KYC Required",
        description: "You need to complete KYC verification before withdrawing funds.",
        variant: "destructive",
      });
      return;
    }

    // Check balance
    if (data.amount > userProfile.walletBalance) {
      form.setError("amount", {
        type: "manual",
        message: "Withdrawal amount cannot exceed your wallet balance",
      });
      return;
    }

    setLoading(true);
    try {
      // Create withdrawal request
      await UPIWalletService.createWithdrawalRequest(
        userProfile.uid,
        data.amount,
        data.upiId,
        userProfile.currency
      );

      // Save UPI ID if requested
      if (data.saveUpiId && !savedUpiIds.includes(data.upiId)) {
        try {
          await UPIWalletService.saveUserUpiId(userProfile.uid, data.upiId);
          setSavedUpiIds(prev => [...prev, data.upiId]);
        } catch (error) {
          console.warn('Failed to save UPI ID:', error);
        }
      }

      setWithdrawAmount(data.amount);
      setSuccess(true);

      toast({
        title: "Withdrawal Request Submitted",
        description: `Your withdrawal request for ${formatCurrency(data.amount, userProfile.currency)} has been submitted and is pending approval.`,
      });

      // Refresh withdrawal requests
      const updatedRequests = await UPIWalletService.getUserWithdrawalRequests(userProfile.uid);
      setWithdrawalRequests(updatedRequests);

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error submitting withdrawal:", error);
      toast({
        title: "Withdrawal Failed",
        description: "Failed to submit withdrawal request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!userProfile) return null;

  // Check if user is from India - Restriction for legal reasons
  if (userProfile.country === 'India') {
    return (
      <Card className="bg-dark-card border-gray-800 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-primary" />
            <span>Withdraw Funds</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="bg-red-900 bg-opacity-20 border-red-800">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertTitle className="text-red-500">Service Unavailable</AlertTitle>
            <AlertDescription className="text-red-400">
              Withdrawals are currently unavailable for users in India due to local legal and regulatory restrictions. We apologize for the inconvenience.
            </AlertDescription>
          </Alert>

          <div className="mt-6 p-4 bg-dark-lighter rounded-lg border border-gray-800">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-gray-400 mt-0.5" />
              <p className="text-sm text-gray-400">
                You can still use your balance to participate in tournaments. If you have any questions, please contact our support team.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t border-gray-800 pt-4">
          <Button
            variant="outline"
            className="border-gray-700 hover:bg-dark-lighter"
            onClick={onClose}
          >
            Close
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Show KYC verification alert if KYC is not approved
  if (!isKycApproved(userProfile.kycStatus)) {
    return (
      <Card className="bg-dark-card border-gray-800 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-primary" />
            <span>Withdraw Funds</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="bg-yellow-900 bg-opacity-20 border-yellow-800">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <AlertTitle className="text-yellow-500">KYC Verification Required</AlertTitle>
            <AlertDescription className="text-yellow-400">
              You need to complete KYC verification before withdrawing funds. This ensures secure and compliant transactions.
            </AlertDescription>
          </Alert>
          <div className="mt-6 text-center">
            <Button
              asChild
              className="bg-gradient-to-r from-primary to-secondary"
            >
              <Link to="/kyc">Complete KYC Verification</Link>
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t border-gray-800 pt-4">
          <Button
            variant="outline"
            className="border-gray-700 hover:bg-dark-lighter"
            onClick={onClose}
          >
            Cancel
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Success dialog
  if (success) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="bg-dark-card text-white border-gray-800">
          <DialogHeader className="text-center">
            <div className="mx-auto bg-green-900 bg-opacity-20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <DialogTitle className="text-xl">Withdrawal Request Submitted</DialogTitle>
            <DialogDescription className="text-gray-400">
              Your withdrawal request for {formatCurrency(withdrawAmount, userProfile.currency)} has been submitted successfully.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-dark-lighter p-4 rounded-lg mt-4">
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">Amount Requested</span>
              <span className="font-semibold">{formatCurrency(withdrawAmount, userProfile.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className="font-semibold text-yellow-400">PENDING APPROVAL</span>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-gray-400 mt-0.5" />
                <p className="text-sm text-gray-400">
                  Your withdrawal request will be reviewed by our admin team. You&apos;ll receive a notification once it&apos;s approved and processed.
                </p>
              </div>
            </div>
          </div>

          <Button
            className="w-full mt-4 bg-gradient-to-r from-primary to-secondary"
            onClick={onClose}
          >
            Continue
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Card className="bg-dark-card border-gray-800 text-white">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <ArrowUpRight className="h-5 w-5 text-primary" />
          <span>Withdraw Funds</span>
        </CardTitle>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>          <CardContent className="space-y-6">
          {/* Balance Information */}
          <div className="flex items-center justify-between p-4 bg-dark-lighter rounded-lg">
            <div>
              <p className="text-sm text-gray-400">Available Balance</p>
              <p className="text-lg font-semibold">{formatCurrency(userProfile.walletBalance, userProfile.currency)}</p>
            </div>
            <div className="bg-green-600/20 p-2 rounded-lg text-sm text-green-400">
              Min: ₹10
            </div>
          </div>

          {/* Quick Amount Selection */}
          <div>
            <p className="text-sm font-medium mb-3">Quick Amount</p>
            <div className="grid grid-cols-3 gap-2">
              {quickAmounts.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant="outline"
                  className="border-gray-700 hover:bg-primary hover:border-primary"
                  onClick={() => form.setValue('amount', amount)}
                  disabled={amount > userProfile.walletBalance}
                >
                  <IndianRupee className="h-3 w-3 mr-1" />
                  {amount}
                </Button>
              ))}
            </div>
          </div>

          {/* Amount Input */}
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Withdrawal Amount</FormLabel>
                <FormControl>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="number"
                      placeholder="0"
                      className="pl-10 bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                      {...field}
                      onChange={e => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                </FormControl>
                <FormDescription>
                  Available: {formatCurrency(userProfile.walletBalance, userProfile.currency)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Saved UPI IDs */}
          {savedUpiIds.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Saved UPI IDs</p>
              <div className="space-y-2">
                {savedUpiIds.map((upiId, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-dark-lighter rounded-lg">
                    <span className="text-sm">{upiId}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleUseSavedUpi(upiId)}
                      >
                        Use
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyUpi(upiId)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteSavedUpi(upiId)}
                        className="text-red-400 border-red-700 hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UPI ID Input */}
          <FormField
            control={form.control}
            name="upiId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>UPI ID</FormLabel>
                <FormControl>
                  <Input
                    placeholder="username@paytm"
                    className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Enter your UPI ID where you want to receive the money
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Save UPI ID Checkbox */}
          <FormField
            control={form.control}
            name="saveUpiId"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>
                    Save this UPI ID for future withdrawals
                  </FormLabel>
                  <FormDescription>
                    We&apos;ll securely store this UPI ID for faster withdrawals
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {/* Recent Withdrawal Requests */}
          {withdrawalRequests.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Recent Withdrawal Requests</p>
              <div className="space-y-3 max-h-40 overflow-y-auto">
                {withdrawalRequests.slice(0, 3).map((request) => (
                  <div key={request.id} className="flex items-center justify-between p-3 bg-dark-lighter rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{formatCurrency(request.amount, request.currency)}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(request.createdAt).toLocaleDateString()} • {request.upiId}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        request.status === 'APPROVED'
                          ? "border-green-600 text-green-500"
                          : request.status === 'REJECTED'
                            ? "border-red-600 text-red-500"
                            : "border-yellow-600 text-yellow-500"
                      }
                    >
                      {request.status === 'APPROVED' && <CheckCircle className="h-3 w-3 mr-1" />}
                      {request.status === 'PENDING' && <Clock className="h-3 w-3 mr-1" />}
                      {request.status === 'REJECTED' && <X className="h-3 w-3 mr-1" />}
                      {request.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Important Information */}
          <Alert className="bg-dark-lighter border-gray-700">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription className="text-gray-400">
              • Withdrawal requests are reviewed within 24-48 hours
              <br />
              • Ensure your UPI ID is correct to avoid delays
              <br />
              • Minimum withdrawal amount is ₹10
            </AlertDescription>
          </Alert>
        </CardContent>

          <CardFooter className="flex justify-between border-t border-gray-800 pt-4">
            <Button
              variant="outline"
              className="border-gray-700 hover:bg-dark-lighter"
              onClick={onClose}
              type="button"
            >
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-primary to-secondary"
              type="submit"
              disabled={loading}
            >
              {loading ? "Submitting..." : "Submit Withdrawal"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};

export default UPIWithdrawMoney;
