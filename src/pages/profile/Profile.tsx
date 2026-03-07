import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUser } from "@/hooks/useUser";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Shield, Gamepad2, Settings, LogOut, Upload, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

const profileSchema = z.object({
  username: z.string().min(3, {
    message: "Username must be at least 3 characters.",
  }),
  gameId: z.string().min(6, {
    message: "Game ID must be at least 6 characters.",
  }),
  email: z.string().email().optional().nullable(),
  profilePicture: z.string().optional().nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function Profile() {
  const navigate = useNavigate();
  const { userProfile, updateUserProfile, checkUsernameExists, signOut } = useAuth();
  const { updateGameId, uploadProfileImage } = useUser();
  const { toast } = useToast();
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'account' | 'gaming'>("account");
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: userProfile?.username || "",
      gameId: userProfile?.gameId || "",
      email: userProfile?.email || "",
      profilePicture: userProfile?.profilePicture || "",
    },
  });
  
  useEffect(() => {
    if (userProfile) {
      form.reset({
        username: userProfile.username || "",
        gameId: userProfile.gameId || "",
        email: userProfile.email || "",
        profilePicture: userProfile.profilePicture || "",
      });
      setUsernameAvailable(null);
    }
  }, [userProfile, form]);

  // Username availability check (debounced)
  useEffect(() => {
    const username = form.watch('username');
    if (!username || username.length < 3 || username === userProfile?.username) {
      setUsernameAvailable(null);
      return;
    }
    setCheckingUsername(true);
    const timeout = setTimeout(async () => {
      if (checkUsernameExists) {
        const exists = await checkUsernameExists(username);
        setUsernameAvailable(!exists);
      }
      setCheckingUsername(false);
    }, 500);
    return () => clearTimeout(timeout);
  }, [form.watch('username'), userProfile, checkUsernameExists]);
  
  if (!userProfile) return null;

  const onSubmit = async (values: ProfileFormValues) => {
    // Only allow username update if available or unchanged
    if (values.username !== userProfile.username && usernameAvailable === false) {
      toast({
        variant: "destructive",
        title: "Username not available",
        description: "Please choose a different username.",
      });
      return;
    }
    try {
      await updateUserProfile({
        username: values.username,
        gameId: values.gameId,
        // Do not allow email update from profile page
      });
      if (values.gameId !== userProfile.gameId) {
        await updateGameId(values.gameId);
      }
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: "Failed to update profile. Please try again.",
      });
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageData = e.target?.result as string;
        if (imageData) {
          const success = await uploadProfileImage(imageData);
          if (success) {
            form.setValue("profilePicture", imageData);
            await updateUserProfile({ profilePicture: imageData });
            toast({
              title: "Profile picture updated",
              description: "Your profile picture has been updated successfully.",
            });
          }
        }
      };
      reader.onerror = () => {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: "Failed to process image file. Please try again.",
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: "Failed to upload profile picture. Please try again.",
      });
    }
  };
  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/");
      toast({
        title: "Logged out",
        description: "You have been logged out successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Logout failed",
        description: "Failed to sign out. Please try again.",
      });
    }
  };

  const getKycBadgeVariant = (status: string) => {
    switch (status?.toUpperCase()) {
      case "VERIFIED":
        return "default";
      case "PENDING":
        return "secondary";
      case "REJECTED":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getKycIcon = (status: string) => {
    switch (status?.toUpperCase()) {
      case "VERIFIED":
        return <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />;
      case "PENDING":
        return <Clock className="h-3 w-3 sm:h-4 sm:w-4" />;
      case "REJECTED":
        return <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />;
      default:
        return <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />;
    }
  };

  // Helper type guard for totalWinnings

  return (
    <div className="container-responsive py-4 sm:py-6 md:py-10 max-w-6xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-responsive-lg font-bold font-poppins">My Profile</h1>
        <p className="text-gray-400 mt-1 text-sm sm:text-base">Manage your account settings and gaming preferences</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="lg:col-span-1">
          <Card className="bg-dark-card border-gray-800 p-4 sm:p-6">
            <div className="flex flex-col items-center mb-4 sm:mb-6">
              <div className="relative">
                <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-2 border-primary/20">
                  <AvatarImage src={userProfile.profilePicture || ""} alt={userProfile.username} />
                  <AvatarFallback className="text-lg sm:text-xl font-bold bg-primary/20">
                    {userProfile.username?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <label htmlFor="profile-image" className="absolute bottom-0 right-0 bg-primary hover:bg-primary/90 text-white p-1.5 sm:p-2 rounded-full cursor-pointer transition touch-target">
                  <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
                  <input id="profile-image" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              </div>
              <h3 className="font-semibold text-lg sm:text-xl mt-3 text-center">{userProfile.username}</h3>
              <p className="text-gray-400 text-sm">{userProfile.email}</p>
              <div className="mt-3 sm:mt-4">
                <Badge variant={getKycBadgeVariant(userProfile.kycStatus)} className="flex items-center gap-1 sm:gap-2 text-xs">
                  {getKycIcon(userProfile.kycStatus)}
                  <span className="capitalize">{userProfile.kycStatus}</span>
                </Badge>
              </div>
            </div>
            <nav className="space-y-1 sm:space-y-2">
              <button
                onClick={() => setSelectedTab('account')}
                className={`w-full flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg text-left transition touch-target text-sm sm:text-base ${selectedTab === 'account' ? 'bg-primary/20 text-primary' : 'text-gray-400 hover:text-white hover:bg-dark-lighter'}`}
              >
                <User className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0">Account Info</span>
              </button>
              <button
                onClick={() => setSelectedTab('gaming')}
                className={`w-full flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg text-left transition touch-target text-sm sm:text-base ${selectedTab === 'gaming' ? 'bg-primary/20 text-primary' : 'text-gray-400 hover:text-white hover:bg-dark-lighter'}`}
              >
                <Gamepad2 className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 hidden sm:inline">Gaming Profile</span>
                <span className="min-w-0 sm:hidden">Gaming</span>
              </button>
              <button
                onClick={() => navigate('/kyc')}
                className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg text-left transition hover:bg-dark-lighter text-gray-400 hover:text-white touch-target text-sm sm:text-base"
              >
                <Shield className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 hidden sm:inline">KYC Verification</span>
                <span className="min-w-0 sm:hidden">KYC</span>
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg text-left transition hover:bg-dark-lighter text-gray-400 hover:text-white touch-target text-sm sm:text-base"
              >
                <Settings className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0">Settings</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg text-left transition hover:bg-red-600/20 text-red-400 hover:text-red-300 touch-target text-sm sm:text-base"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0">Logout</span>
              </button>
            </nav>
          </Card>
        </div>
        <div className="lg:col-span-3">
          <Card className="bg-dark-card border-gray-800 p-4 sm:p-6">
            {selectedTab === 'account' && (
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold mb-2">Account Information</h2>
                  <p className="text-gray-400 text-sm sm:text-base">Update your personal and contact information.</p>
                </div>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6 form-mobile">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <FormField control={form.control} name="username" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your username" className="bg-dark-lighter border-gray-700 h-10 sm:h-12" {...field} />
                          </FormControl>
                          <FormDescription className="text-xs sm:text-sm">This is your public display name.</FormDescription>
                          {checkingUsername && (<span className="text-xs text-gray-400">Checking username...</span>)}
                          {usernameAvailable === false && (<span className="text-xs text-red-500">Username not available</span>)}
                          {usernameAvailable === true && (<span className="text-xs text-green-500">Username available</span>)}
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Enter your email" className="bg-dark-lighter border-gray-700 h-10 sm:h-12" value={field.value || ""} disabled />
                          </FormControl>
                          <FormDescription className="text-xs sm:text-sm">Used for notifications and account recovery. (Cannot be changed)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-end">
                      <Button type="button" variant="outline" onClick={() => form.reset()} className="order-2 sm:order-1 touch-target">
                        <span className="hidden sm:inline">Reset Changes</span>
                        <span className="sm:hidden">Reset</span>
                      </Button>
                      <Button type="submit" className="order-1 sm:order-2 touch-target">
                        <span className="hidden sm:inline">Save Changes</span>
                        <span className="sm:hidden">Save</span>
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}
            {selectedTab === 'gaming' && (
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold mb-2">Gaming Profile</h2>
                  <p className="text-gray-400 text-sm sm:text-base">Update your gaming information.</p>
                </div>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6 form-mobile">
                    <FormField control={form.control} name="gameId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Game ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your game ID" className="bg-dark-lighter border-gray-700 h-10 sm:h-12" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs sm:text-sm">This is your in-game player ID.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-end">
                      <Button type="button" variant="outline" onClick={() => form.reset()} className="order-2 sm:order-1 touch-target">
                        <span className="hidden sm:inline">Reset Changes</span>
                        <span className="sm:hidden">Reset</span>
                      </Button>
                      <Button type="submit" className="order-1 sm:order-2 touch-target">
                        <span className="hidden sm:inline">Save Game ID</span>
                        <span className="sm:hidden">Save</span>
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}