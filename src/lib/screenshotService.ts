import { storage, db } from './firebaseConfig';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, getDoc } from 'firebase/firestore';

export interface ScreenshotUploadResult {
  success: boolean;
  downloadURL?: string;
  error?: string;
}

/**
 * Calculate tournament points based on kills and position
 */
export const calculateTournamentPoints = (kills: number, position: number | null): number => {
  let points = 0;

  // Points for kills (1 point per kill)
  points += kills;

  // Points for placement
  if (position === 1) points += 10; // Winner gets 10 points
  else if (position === 2) points += 6; // Second place gets 6 points
  else if (position === 3) points += 4; // Third place gets 4 points
  else if (position && position <= 10) points += 2; // Top 10 gets 2 points

  return points;
};

export class ScreenshotService {
  /**
   * Upload a screenshot for a match result
   */
  static async uploadMatchScreenshot(
    userId: string,
    matchId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ScreenshotUploadResult> {
    try {
      // Validate file
      if (!file.type.startsWith('image/')) {
        return { success: false, error: 'Please upload an image file' };
      }

      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        return { success: false, error: 'Image size should be less than 5MB' };
      }

      // Create unique filename
      const timestamp = Date.now();
      const fileName = `screenshots/${userId}/${matchId}/result_${timestamp}.${file.name.split('.').pop()}`;

      // Create storage reference
      const storageRef = ref(storage, fileName);

      // Upload file with progress tracking
      if (onProgress) {
        const uploadTask = uploadBytesResumable(storageRef, file);

        return new Promise((resolve) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              onProgress(progress);
            },
            (error) => {
              console.error('Screenshot upload error:', error);
              resolve({ success: false, error: error.message });
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve({ success: true, downloadURL });
              } catch (error) {
                resolve({ success: false, error: (error as Error).message });
              }
            }
          );
        });
      } else {
        // Simple upload without progress
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        return { success: true, downloadURL };
      }
    } catch (error) {
      console.error('Screenshot upload error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Upload a screenshot from base64 data
   */
  static async uploadScreenshotFromBase64(
    userId: string,
    matchId: string,
    base64Data: string
  ): Promise<ScreenshotUploadResult> {
    try {
      // Convert base64 to blob
      const response = await fetch(base64Data);
      const blob = await response.blob();

      // Create file from blob
      const file = new File([blob], `screenshot_${Date.now()}.jpg`, {
        type: 'image/jpeg'
      });

      return this.uploadMatchScreenshot(userId, matchId, file);
    } catch (error) {
      console.error('Base64 screenshot upload error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Update match result with screenshot and data
   */
  static async submitMatchResult(
    matchId: string,
    screenshot: string,
    userIdInput: string, // Accept userId as parameter
    kills?: number,
    position?: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[ScreenshotService] Submitting result for matchId:', matchId, 'userId:', userIdInput);

      let userId = userIdInput;
      let tournamentId: string | undefined;

      // First try to update user_matches document (if matchId is a document ID)
      try {
        const matchRef = doc(db, 'user_matches', matchId);
        const matchDoc = await getDoc(matchRef);

        const updateData = {
          resultScreenshot: screenshot,
          resultImageUrl: screenshot,
          resultSubmitted: true,
          resultSubmittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...(typeof kills === 'number' && { kills }),
          ...(typeof position === 'number' && { position })
        };

        if (matchDoc.exists()) {
          const data = matchDoc.data();
          userId = data.userId || userId;
          tournamentId = data.tournamentId;
          await updateDoc(matchRef, updateData);
          console.log('[ScreenshotService] Updated user_matches via direct doc ID');
        } else {
          // If matchId is NOT a doc ID, it might be a tournamentId
          // Try to find the user_match for this user and tournament
          const q = query(
            collection(db, 'user_matches'),
            where('userId', '==', userId),
            where('tournamentId', '==', matchId)
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const docRef = snapshot.docs[0].ref;
            tournamentId = matchId;
            await updateDoc(docRef, updateData);
            console.log('[ScreenshotService] Updated user_matches via userId/tournamentId query');
          }
        }
      } catch (userMatchError) {
        // Silently log permission errors as this collection might be legacy or have stricter rules
        // The tournament_registrations update below is the primary success indicator
        console.log('[ScreenshotService] Optional user_matches update skipped (likely permission-based)');
      }


      // Also update the tournament registration with the result image URL
      try {
        // If we don't have tournamentId yet, assume matchId might be it
        if (!tournamentId) {
          tournamentId = matchId;
        }

        const registrationQuery = query(
          collection(db, 'tournament_registrations'),
          where('userId', '==', userId),
          where('tournamentId', '==', tournamentId)
        );

        const registrationSnapshot = await getDocs(registrationQuery);

        if (!registrationSnapshot.empty) {
          const registrationRef = registrationSnapshot.docs[0].ref;
          await updateDoc(registrationRef, {
            resultImageUrl: screenshot,
            resultSubmitted: true,
            resultSubmittedAt: serverTimestamp(),
            ...(typeof kills === 'number' && { kills }),
            ...(typeof position === 'number' && { position }),
            points: calculateTournamentPoints(kills || 0, position || null),
            updatedAt: serverTimestamp()
          });
          console.log('[ScreenshotService] Updated tournament_registrations');
        } else {
          // One final try with matchId as direct doc ID for registration
          const regRef = doc(db, 'tournament_registrations', matchId);
          const regDoc = await getDoc(regRef);
          if (regDoc.exists()) {
            await updateDoc(regRef, {
              resultImageUrl: screenshot,
              resultSubmitted: true,
              resultSubmittedAt: serverTimestamp(),
              ...(typeof kills === 'number' && { kills }),
              ...(typeof position === 'number' && { position }),
              points: calculateTournamentPoints(kills || 0, position || null),
              updatedAt: serverTimestamp()
            });
            console.log('[ScreenshotService] Updated tournament_registrations via direct doc ID');
          } else {
            console.error('[ScreenshotService] No tournament registration found for userId:', userId, 'tournamentId:', tournamentId);
            return { success: false, error: 'Tournament registration not found' };
          }
        }
      } catch (regError) {
        console.error('[ScreenshotService] Failed to update tournament registration:', regError);
        return { success: false, error: 'Failed to update tournament registration: ' + (regError as Error).message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error submitting match result:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Validate image file before upload
   */
  static validateImageFile(file: File): { valid: boolean; error?: string } {
    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      return { valid: false, error: 'Please select an image file' };
    }

    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return { valid: false, error: 'Image size must be less than 5MB' };
    }

    // Check supported formats
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      return { valid: false, error: 'Supported formats: JPEG, PNG, WebP' };
    }

    return { valid: true };
  }

  /**
   * Get download URL for a storage path
   */
  static async getDownloadURL(storagePath: string): Promise<string | null> {
    try {
      const storageRef = ref(storage, storagePath);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error('Error getting download URL:', error);
      return null;
    }
  }
}
