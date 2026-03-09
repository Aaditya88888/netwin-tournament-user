import React, { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { MIN_WITHDRAWAL } from "@/utils/constants";
import { formatCurrency } from "@/lib/utils";
import { ArrowUpRight, AlertCircle, Info, CheckCircle } from 'lucide-react';
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
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { WithdrawalRequest } from "@/contexts/WalletContext";


// Create schema based on country and currency
const createWithdrawalSchema = (country: string, currency: string) => {
  const minAmount = MIN_WITHDRAWAL[currency as 'INR' | 'NGN' | 'USD'] || 10;
  if (country === 'Nigeria') {
    return z.object({
      amount: z.preprocess(
        (val) => (val === "" ? undefined : Number(val)),
        z.number().min(minAmount, `Minimum withdrawal is ${minAmount}`).max(100000, "Maximum withdrawal is 100,000")
      ),
      bankName: z.string().min(2, "Bank name is required"),
      accountNumber: z.string().length(10, "Account number must be 10 digits"),
      accountName: z.string().min(3, "Recipient's full name is required"),
    });
  } else if (country === 'United States' || country === 'USA' || country === 'US') {
    return z.object({
      amount: z.preprocess(
        (val) => (val === "" ? undefined : Number(val)),
        z.number().min(minAmount, `Minimum withdrawal is ${minAmount}`).max(100000, "Maximum withdrawal is 100,000")
      ),
      accountName: z.string().min(3, "Recipient's full name is required"),
      recipientAddress: z.string().min(5, "Recipient's full address is required"),
      bankName: z.string().min(2, "Bank name is required"),
      bankAddress: z.string().min(5, "Bank address is required"),
      accountNumber: z.string().min(5, "Account number is required"),
      routingNumber: z.string().length(9, "Routing number (ABA) must be 9 digits"),
    });
  } else {
    // Default (India/UPI)
    return z.object({
      amount: z.preprocess(
        (val) => (val === "" ? undefined : Number(val)),
        z.number().min(minAmount, `Minimum withdrawal is ${minAmount}`).max(100000, "Maximum withdrawal is 100,000")
      ),
      accountNumber: z.string().min(5, "Account number is required"),
      accountName: z.string().min(3, "Account holder name is required"),
      bankName: z.string().min(2, "Bank name is required"),
      ifsc: currency === 'INR' ? z.string().min(11, "IFSC code is required") : z.string().optional(),
      swiftCode: currency === 'USD' ? z.string().min(8, "SWIFT code is required") : z.string().optional(),
    });
  }
};

type WithdrawalFormValues =
  | {
      amount: number;
      bankName: string;
      accountNumber: string;
      accountName: string;
    } // Nigeria
  | {
      amount: number;
      accountName: string;
      recipientAddress: string;
      bankName: string;
      bankAddress: string;
      accountNumber: string;
      routingNumber: string;
    } // USA
  | {
      amount: number;
      accountNumber: string;
      accountName: string;
      bankName: string;
      ifsc?: string;
      swiftCode?: string;
    }; // Default/India

interface WithdrawMoneyProps {
  onClose: () => void;
}

// Replace all lowercase KYC status string comparisons/assignments with uppercase enum values
const isKycApproved = (status: string) => status?.toUpperCase() === "APPROVED";

const WithdrawMoney = ({ onClose }: WithdrawMoneyProps) => {
  const { user, userProfile } = useAuth();
  const { withdrawMoney } = useWallet();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  
  if (!userProfile) return null;
  
  // Create schema based on user's country and currency
  const withdrawalSchema = createWithdrawalSchema(userProfile.country, userProfile.currency);
  
  const form = useForm<WithdrawalFormValues>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      amount: 0,
      accountNumber: "",
      accountName: "",
      bankName: "",
      recipientAddress: "",
      bankAddress: "",
      routingNumber: "",
      ifsc: "",
      swiftCode: "",
    } as WithdrawalFormValues,
  });
  
  const onSubmit = async (data: WithdrawalFormValues) => {
    if (!user) return;
    // Check if amount is greater than wallet balance
    if (data.amount > userProfile.walletBalance) {
      form.setError("amount", {
        type: "manual",
        message: "Withdrawal amount cannot exceed your wallet balance",
      });
      return;
    }
    // Check if KYC is approved
    if (!isKycApproved(userProfile.kycStatus)) {
      toast({
        title: "KYC Required",
        description: "You need to complete KYC verification before withdrawing funds.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      let bankDetails: Record<string, string> = {};
      let withdrawalRequest: WithdrawalRequest;
      if (userProfile.country === 'Nigeria') {
        bankDetails = {
          accountName: data.accountName,
          bankName: data.bankName,
          accountNumber: data.accountNumber,
        };
        withdrawalRequest = {
          amount: data.amount,
          accountNumber: data.accountNumber,
          accountName: data.accountName,
          bankName: data.bankName,
          paymentMethod: 'bank_transfer',
          bankDetails,
        };
      } else if (userProfile.country === 'United States' || userProfile.country === 'USA' || userProfile.country === 'US') {
        const usaData = data as {
          amount: number;
          accountName: string;
          recipientAddress: string;
          bankName: string;
          bankAddress: string;
          accountNumber: string;
          routingNumber: string;
        };
        bankDetails = {
          accountName: usaData.accountName,
          recipientAddress: usaData.recipientAddress,
          bankName: usaData.bankName,
          bankAddress: usaData.bankAddress,
          accountNumber: usaData.accountNumber,
          routingNumber: usaData.routingNumber,
        };
        withdrawalRequest = {
          amount: usaData.amount,
          accountNumber: usaData.accountNumber,
          accountName: usaData.accountName,
          bankName: usaData.bankName,
          paymentMethod: 'bank_transfer',
          bankDetails,
        };
      } else {
        // Default/India
        const indiaData = data as {
          amount: number;
          accountName: string;
          bankName: string;
          accountNumber: string;
          ifsc?: string;
          swiftCode?: string;
        };
        bankDetails = {
          accountName: indiaData.accountName,
          bankName: indiaData.bankName,
          accountNumber: indiaData.accountNumber,
          ifsc: indiaData.ifsc || '',
          swiftCode: indiaData.swiftCode || '',
        };
        withdrawalRequest = {
          amount: indiaData.amount,
          accountNumber: indiaData.accountNumber,
          accountName: indiaData.accountName,
          bankName: indiaData.bankName,
          ifscCode: indiaData.ifsc || '',
          paymentMethod: 'bank_transfer',
          bankDetails,
        };
      }
      const success = await withdrawMoney(withdrawalRequest, userProfile);
      if (success) {
        setWithdrawAmount(data.amount);
        setSuccess(true);
      } else {
        throw new Error("Failed to process withdrawal");
      }
    } catch (error) {
      toast({
        title: "Withdrawal Failed",
        description: "Failed to process your withdrawal request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const minWithdrawal = MIN_WITHDRAWAL[userProfile.currency as 'INR' | 'NGN' | 'USD'] || 10;
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
              You need to complete KYC verification before withdrawing funds.
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
  
  if (success) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="bg-dark-card text-white border-gray-800">
          <DialogHeader className="text-center">
            <div className="mx-auto bg-green-900 bg-opacity-20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <DialogTitle className="text-xl">Withdrawal Requested</DialogTitle>
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
              <span className="font-semibold text-yellow-400">PENDING</span>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-gray-400 mt-0.5" />
                <p className="text-sm text-gray-400">
                  Withdrawals are typically processed within 24-48 hours. You will receive a notification once your withdrawal is processed.
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpRight className="h-5 w-5 text-primary" />
          <span>Withdraw Funds</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-gray-400">Available Balance</p>
            <p className="text-lg font-semibold">{formatCurrency(userProfile.walletBalance, userProfile.currency)}</p>
          </div>
          <div className="bg-dark-lighter p-2 rounded-lg text-sm">
            Min: {formatCurrency(minWithdrawal, userProfile.currency)}
          </div>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Withdrawal Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                      {...field}
                      onChange={e => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Minimum: {formatCurrency(minWithdrawal, userProfile.currency)}, Maximum: {formatCurrency(userProfile.walletBalance, userProfile.currency)}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            

            {/* Nigeria Fields */}
            {userProfile.country === 'Nigeria' && (
              <>
                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient&apos;s Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter recipient&apos;s full name"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter bank name"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter 10-digit account number"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* USA Fields */}
            {(userProfile.country === 'United States' || userProfile.country === 'USA' || userProfile.country === 'US') && (
              <>
                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient&apos;s Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter recipient&apos;s full name"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="recipientAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient&apos;s Full Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Street, City, State, Zip"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter bank name"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Bank street, city, state, zip"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter account number"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="routingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank&apos;s Routing Number (ABA)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="9-digit routing number"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* Default/India Fields */}
            {userProfile.country !== 'Nigeria' && !(userProfile.country === 'United States' || userProfile.country === 'USA' || userProfile.country === 'US') && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter bank name"
                            className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accountNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter account number"
                            className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Holder Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter account holder name"
                          className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {userProfile.currency === 'INR' && (
                  <FormField
                    control={form.control}
                    name="ifsc"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IFSC Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter IFSC code"
                            className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {userProfile.currency === 'USD' && (
                  <FormField
                    control={form.control}
                    name="swiftCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SWIFT Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter SWIFT code"
                            className="bg-dark-lighter border-0 focus-visible:ring-2 focus-visible:ring-primary"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}
            
            <Alert className="bg-dark-lighter border-gray-700 mt-4">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription className="text-gray-400">
                Withdrawals are processed within 24-48 hours. Ensure your bank details are correct to avoid delays.
              </AlertDescription>
            </Alert>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between border-t border-gray-800 pt-4">
        <Button 
          variant="outline" 
          className="border-gray-700 hover:bg-dark-lighter"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button 
          className="bg-gradient-to-r from-primary to-secondary"
          onClick={form.handleSubmit(onSubmit)}
          disabled={loading}
        >
          {loading ? "Processing..." : "Submit Withdrawal"}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default WithdrawMoney;
