import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFirebase } from "@/contexts/FirebaseContext";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { User, Gamepad2, Globe, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { detectUserCountry, GeoLocation } from "@/utils/geoService";

// Form schema for profile completion
const profileCompletionSchema = z.object({
  displayName: z.string().min(1, {
    message: "Display name is required.",
  }),
  username: z.string().optional(),
  phoneNumber: z.string().optional(),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions."
  }),
});

type ProfileCompletionValues = z.infer<typeof profileCompletionSchema>;

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userProfile, checkUsernameExists } = useAuth();
  const { completeGoogleProfile } = useFirebase();
  const [loading, setLoading] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [detectedGeo, setDetectedGeo] = useState<GeoLocation | null>(null);
  const [incompleteUserData, setIncompleteUserData] = useState<{
    uid: string;
    email: string;
    displayName: string;
    photoURL: string;
  } | null>(null);

  // Get incomplete user data from session storage
  useEffect(() => {
    const incompleteUserStr = sessionStorage.getItem('incompleteGoogleUser');
    if (incompleteUserStr) {
      const userData = JSON.parse(incompleteUserStr);
      setIncompleteUserData(userData);
    } else {
      // If no incomplete user data, redirect to login
      navigate('/login');
    }
  }, [navigate]);

  const form = useForm<ProfileCompletionValues>({
    resolver: zodResolver(profileCompletionSchema),
    defaultValues: {
      username: "",
      phoneNumber: "",
      termsAccepted: false,
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

  // Set default values when incomplete user data is loaded
  useEffect(() => {
    if (incompleteUserData) {
      form.setValue("displayName", incompleteUserData.displayName || "");
    }
  }, [incompleteUserData, form]);

  // Redirect if user profile is already complete
  useEffect(() => {
    // Only redirect if profile is complete and we are on the complete-profile page
    if (userProfile && userProfile.username && userProfile.country) {
      if (window.location.pathname === '/auth/complete-profile') {
        navigate("/dashboard", { replace: true });
      }
    }
  }, [userProfile, navigate]);

  // Debounced username checking
  useEffect(() => {
    const username = form.watch('username');
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      checkUsernameAvailability(username);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [form.watch('username')]);

  // Check username availability

  // Check username availability
  const checkUsernameAvailability = async (username: string) => {
    if (username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    if (!checkUsernameExists) {
      console.error('checkUsernameExists function is not available');
      setUsernameAvailable(null);
      return;
    }

    setUsernameChecking(true);
    try {
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

  // Handle form submission
  const onSubmit = async (values: ProfileCompletionValues) => {
    setLoading(true);

    try {
      // Check username one more time if provided
      if (values.username && usernameAvailable === false) {
        toast({
          variant: "destructive",
          title: "Username not available",
          description: "Please choose a different username.",
        });
        return;
      }

      // Use the complete Google profile function
      await completeGoogleProfile({
        displayName: values.displayName,
        username: values.username || incompleteUserData?.email.split('@')[0] || '',
        phoneNumber: values.phoneNumber,
        country: detectedGeo?.country || 'United States',
        currency: detectedGeo?.currency || 'USD',
      });

      toast({
        title: "Profile completed successfully!",
        description: "Welcome to Netwin! Your profile has been set up.",
      });

      navigate("/dashboard");
    } catch (error) {
      const err = error as { message?: string };
      toast({
        variant: "destructive",
        title: "Profile completion failed",
        description: err.message || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container min-h-screen py-10 flex items-center justify-center bg-dark">
      <Card className="w-full max-w-lg bg-dark-card border-gray-800">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary text-transparent bg-clip-text">
            Complete Your Profile
          </CardTitle>
          <p className="text-gray-400">
            Please provide additional details to complete your account setup
          </p>
        </CardHeader>

        <CardContent>
          {/* Display email from Google */}
          {incompleteUserData && (
            <div className="mb-6 p-4 bg-dark-lighter border border-gray-700 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Signing in as</p>
                  <p className="font-medium">{incompleteUserData.email}</p>
                </div>
              </div>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Display Name */}
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Your display name"
                          className="pl-10 bg-dark-lighter border-gray-700"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Username */}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Choose a unique username"
                          className="pl-10 bg-dark-lighter border-gray-700"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                    {usernameChecking && (
                      <p className="mt-2 text-sm text-gray-400">
                        Checking username availability...
                      </p>
                    )}
                    {field.value && usernameAvailable === true && (
                      <p className="mt-2 text-sm text-green-400">
                        ✓ Username is available
                      </p>
                    )}
                    {field.value && usernameAvailable === false && (
                      <p className="mt-2 text-sm text-red-400">
                        ✗ Username is already taken
                      </p>
                    )}
                  </FormItem>
                )}
              />

              {/* Phone Number */}
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Your phone number"
                          className="pl-10 bg-dark-lighter border-gray-700"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />




              {/* Terms and Conditions */}
              <FormField
                control={form.control}
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
              />

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-secondary"
                disabled={loading || (!!form.watch('username') && usernameAvailable === false) || !form.watch('termsAccepted')}
              >
                {loading ? "Completing Profile..." : "Complete Profile"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
