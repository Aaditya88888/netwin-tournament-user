import React from "react";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, AtSign, Loader2, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { OtpVerificationModal } from "@/components/auth/OtpVerificationModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { detectUserCountry, GeoLocation } from "@/utils/geoService";

// Define form schema for email signup validation
const signupWithEmailSchema = z.object({
  username: z.string().optional(),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms and conditions." }),
  }),
});

type SignupWithEmailValues = z.infer<typeof signupWithEmailSchema>;

export default function Signup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signUpWithEmail, loading: authLoading, checkUsernameExists } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingSignupData, setPendingSignupData] = useState<SignupWithEmailValues | null>(null);
  const [detectedGeo, setDetectedGeo] = useState<GeoLocation | null>(null);

  // Email form
  const emailForm = useForm<SignupWithEmailValues>({
    resolver: zodResolver(signupWithEmailSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      termsAccepted: true,
    },
  });

  // Automatically detect user country on component mount
  useEffect(() => {
    const detect = async () => {
      const geo = await detectUserCountry();
      setDetectedGeo(geo);
    };
    detect();
  }, []);

  // Debounced username checking
  useEffect(() => {
    const username = emailForm.watch('username');
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      checkUsernameAvailability(username);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [emailForm.watch('username')]);

  // Check username availability
  const checkUsernameAvailability = async (username: string) => {
    if (!username || username.trim() === '') {
      setUsernameAvailable(null);
      return;
    }

    if (!checkUsernameExists) {
      console.error('checkUsernameExists function is not available');
      setUsernameAvailable(null);
      return;
    }

    setUsernameChecking(true);
    try {      // This will use the case-insensitive matching we implemented
      const exists = await checkUsernameExists(username);

      if (exists) {
        setUsernameAvailable(false);
      } else {
        setUsernameAvailable(true);
      }
    } catch (error) {
      setUsernameAvailable(null);
    } finally {
      setUsernameChecking(false);
    }
  };
  // Handle email form submission
  async function onEmailSubmit(values: SignupWithEmailValues) {
    setIsLoading(true);

    try {
      // Store the signup data for OTP verification
      setPendingSignupData(values);

      // Show OTP modal
      setShowOtpModal(true);

    } catch (error) {
      const err = error as { message?: string };
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Something went wrong. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Handle successful OTP verification
  const handleOtpVerificationSuccess = async () => {
    if (!pendingSignupData) return;

    setIsLoading(true);
    try {
      // Save signup data to sessionStorage for the Firebase context to use
      sessionStorage.setItem('signupData', JSON.stringify({
        username: pendingSignupData.username || '',
        country: detectedGeo?.country || 'United States',
        currency: detectedGeo?.currency || 'USD'
      }));

      // Create the account
      await signUpWithEmail(pendingSignupData.email, pendingSignupData.password);

      toast({
        title: "Account created successfully!",
        description: "Welcome to Netwin! Your username is: " + pendingSignupData.username,
      });

      // Close OTP modal
      setShowOtpModal(false);
      setPendingSignupData(null);

      navigate("/dashboard");
    } catch (error) {
      const err = error as { message?: string };
      toast({
        variant: "destructive",
        title: "Sign up failed",
        description: err.message || "Please check your details and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OTP verification cancellation
  const handleOtpCancel = () => {
    setShowOtpModal(false);
    setPendingSignupData(null);
    setIsLoading(false);
  };

  // Toggle password visibility
  const toggleShowPassword = () => setShowPassword(!showPassword);

  return (
    <>
      <div className="container min-h-screen py-10 flex items-center justify-center">
        <div className="flex flex-col w-full max-w-lg space-y-8 p-6 sm:p-8 bg-dark-card rounded-xl border border-gray-800">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <img src="/netwin-logo.png" alt="NetWin" className="h-16 w-16" />
            </div>
            <h1 className="text-3xl font-bold font-poppins bg-gradient-to-r from-primary to-secondary text-transparent bg-clip-text">
              Join Netwin
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Create your tournament account with email
            </p>
          </div>

          {/* Email Signup Form */}
          <Form {...emailForm}>
            <form
              onSubmit={emailForm.handleSubmit(onEmailSubmit)}
              className="space-y-5"
            >
              <FormField
                control={emailForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Choose a username (or leave blank to auto-generate)"
                          className="pl-10 bg-dark-lighter border-gray-700"
                          {...field}
                          onBlur={() => checkUsernameAvailability(field.value || '')}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                    {usernameChecking && (
                      <p className="mt-2 text-sm text-gray-400">
                        Checking username availability...
                      </p>
                    )}
                    {field.value && usernameAvailable === false && (
                      <p className="mt-2 text-sm text-red-500">
                        Username is already taken. Please choose another.
                      </p>
                    )}
                    {field.value && usernameAvailable === true && (
                      <p className="mt-2 text-sm text-green-500">
                        Username is available!
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={emailForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <AtSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Enter your email"
                          className="pl-10 bg-dark-lighter border-gray-700"
                          type="email"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={emailForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Create a password"
                          className="pr-10 bg-dark-lighter border-gray-700"
                          type={showPassword ? "text" : "password"}
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={toggleShowPassword}
                          className="absolute right-3 top-3 text-gray-400 hover:text-gray-300"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />




              <FormField
                control={emailForm.control}
                name="termsAccepted"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-sm">
                        I agree to the{" "}
                        <Link to="/terms" className="text-primary hover:underline">
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link to="/privacy" className="text-primary hover:underline">
                          Privacy Policy
                        </Link>
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={isLoading || authLoading || (!!emailForm.watch('username') && usernameAvailable === false) || usernameChecking}
              >
                {(isLoading || authLoading) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : usernameChecking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking username...
                  </>
                ) : (!!emailForm.watch('username') && usernameAvailable === false) ? (
                  "Username not available"
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </Form>

          <div className="text-center text-sm text-gray-500">
            <span>Already have an account? </span>
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </div>

          <Separator className="bg-gray-800" />          <div className="text-center text-xs text-gray-500">            <p>
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </p>
          </div>
        </div>
      </div>

      {/* OTP Verification Modal */}
      <OtpVerificationModal
        open={showOtpModal}
        onOpenChange={setShowOtpModal}
        email={pendingSignupData?.email || ''}
        onVerificationSuccess={handleOtpVerificationSuccess}
        onCancel={handleOtpCancel}
      />
    </>
  );
}
