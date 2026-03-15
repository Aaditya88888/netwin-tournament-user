import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, CheckCircle, RefreshCw } from 'lucide-react';

interface OtpVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onVerificationSuccess: () => void;
  onCancel: () => void;
}

export const OtpVerificationModal: React.FC<OtpVerificationModalProps> = ({ 
  open, 
  onOpenChange, 
  email,
  onVerificationSuccess,
  onCancel 
}) => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);

  // Timer for OTP expiry
  useEffect(() => {
    if (open && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      setCanResend(true);
    }
  }, [open, timeLeft]);

  // Generate and send OTP when modal opens
  useEffect(() => {
    if (open && email) {
      sendOtp();
    }
  }, [open, email]);

  const sendOtp = async () => {
    try {
      setResendLoading(true);
      setError('');
      
      const apiUrl = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : 'http://localhost:5000';
      const endpoint = apiUrl ? `${apiUrl}/api/auth/send-otp` : '/api/auth/send-otp';
      
      // Call the backend API to send OTP
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          purpose: 'registration'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send OTP');
      }

      const data = await response.json();
      
      setTimeLeft(data.expires || 300); // Reset timer
      setCanResend(false);
      setOtp(['', '', '', '', '', '']);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send OTP. Please try again.';
      setError(errorMessage);
    } finally {
      setResendLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return; // Only allow single digit
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    try {
      setLoading(true);
      setError('');

      const enteredOtp = otp.join('');
      
      if (enteredOtp.length !== 6) {
        setError('Please enter the complete 6-digit OTP');
        return;
      }

      const apiUrl = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : 'http://localhost:5000';
      const endpoint = apiUrl ? `${apiUrl}/api/auth/verify-otp` : '/api/auth/verify-otp';

      // Call the backend API to verify OTP
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          otp: enteredOtp
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Invalid OTP');
      }

      const data = await response.json();
      
      if (data.verified) {
        onVerificationSuccess();
      } else {
        setError('Invalid OTP. Please check and try again.');
        setOtp(['', '', '', '', '', '']);
        // Focus first input
        const firstInput = document.getElementById('otp-0');
        firstInput?.focus();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Verification failed. Please try again.';
      setError(errorMessage);
      setOtp(['', '', '', '', '', '']);
      // Focus first input
      const firstInput = document.getElementById('otp-0');
      firstInput?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOtp(['', '', '', '', '', '']);
    setError('');
    setTimeLeft(300);
    setCanResend(false);
    onCancel();
    onOpenChange(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] bg-dark-card border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-white">
            Verify Your Email
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            We&apos;ve sent a 6-digit verification code to <strong className="text-white">{email}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* OTP Input Fields */}
          <div className="space-y-2">
            <Label className="text-white">Enter 6-digit code</Label>
            <div className="flex gap-2 justify-center">
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  id={`otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-12 h-12 text-center text-lg font-semibold bg-dark-lighter border-gray-700 text-white"
                  disabled={loading}
                />
              ))}
            </div>
          </div>

          {/* Timer and Resend */}
          <div className="text-center space-y-2">
            {timeLeft > 0 ? (
              <p className="text-sm text-gray-400">
                Code expires in <span className="text-white font-medium">{formatTime(timeLeft)}</span>
              </p>
            ) : (
              <p className="text-sm text-red-400">Code has expired</p>
            )}
            
            {(canResend || timeLeft === 0) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={sendOtp}
                disabled={resendLoading}
                className="text-primary hover:text-primary/80"
              >
                {resendLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Resend Code
                  </>
                )}
              </Button>
            )}
          </div>

          {error && (
            <Alert className="border-red-500/20 bg-red-500/10">
              <AlertDescription className="text-red-400">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleVerifyOtp}
              disabled={loading || otp.join('').length !== 6}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Verify Code
                </>
              )}
            </Button>
          </div>

          {/* Help Text */}
          <div className="text-center">
            <p className="text-xs text-gray-500">
              Didn&apos;t receive the code? Check your spam folder or try resending.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
