import { useState, useEffect } from "react";
import { KycDocument, UserProfile, SquadMember } from "@/types";
import { useAuth } from "./useAuth";
import { getRequiredKycDocuments } from "@/utils/helpers";
import { useFirebase } from "@/contexts/FirebaseContext";
import {
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

export function useUser() {
  const { user } = useAuth();
  const { userProfile, updateUserProfile, refreshUserProfile } = useFirebase();
  const [kycDocuments, setKycDocuments] = useState<KycDocument[]>([]);
  const [squadMembers, setSquadMembers] = useState<SquadMember[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let unsubscribeKyc: (() => void) | undefined;

    const loadData = async () => {
      if (userProfile) {
        try {
          setLoading(true);

          // Load KYC documents with real-time listener
          unsubscribeKyc = await loadKycDocuments();

          // Load squad members from Firestore
          await loadSquadMembers();
        } catch (error) {
          console.error("Error loading user data:", error);
          // Fallback to localStorage
          loadLocalData();
        } finally {
          setLoading(false);
        }
      } else if (user) {
        // Fallback to local data if Firebase profile is not available
        loadLocalData();
        setLoading(false);
      }
    };

    loadData();

    // Cleanup function
    return () => {
      if (unsubscribeKyc) {
        unsubscribeKyc();
      }
    };
  }, [user, userProfile]);

  const loadKycDocuments = async () => {
    if (!userProfile) return;

    try {
      const kycQuery = query(
        collection(db, "kyc_documents"),
        where("userId", "==", userProfile.uid)
      );

      console.log("[useUser] Setting up KYC listener for UID:", userProfile.uid);
      // Set up real-time listener for KYC documents
      const unsubscribe = onSnapshot(kycQuery, (snapshot) => {
        console.log("[useUser] KYC snapshot received, docs count:", snapshot.size);
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
        })) as KycDocument[];
        setKycDocuments(docs);

      }, (error) => {
        console.warn("Error listening to KYC documents:", error);
        // Fallback to localStorage
        const storedKycStr = localStorage.getItem('netwin_kyc');
        if (storedKycStr) {
          try {
            const allKycDocs = JSON.parse(storedKycStr) as Record<string, KycDocument[]>;
            setKycDocuments(allKycDocs[userProfile.uid] || []);
          } catch (parseError) {
            console.error("Failed to parse KYC documents", parseError);
            setKycDocuments([]);
          }
        }
      });

      // Return unsubscribe function to clean up listener
      return unsubscribe;
    } catch (error) {
      console.warn("Could not load KYC documents from Firestore, using localStorage:", error);
      // Fallback to localStorage
      const storedKycStr = localStorage.getItem('netwin_kyc');
      if (storedKycStr) {
        try {
          const allKycDocs = JSON.parse(storedKycStr) as Record<string, KycDocument[]>;
          setKycDocuments(allKycDocs[userProfile.uid] || []);
        } catch (parseError) {
          console.error("Failed to parse KYC documents", parseError);
          setKycDocuments([]);
        }
      }
    }
  };
  const loadSquadMembers = async () => {
    if (!userProfile) return;

    try {
      const squadQuery = query(
        collection(db, "squad_members"),
        where("ownerId", "==", userProfile.uid)
      );
      const squadSnapshot = await getDocs(squadQuery);
      const members = squadSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id || Date.now(), // Use data.id or generate one
          username: data.username,
          gameId: data.gameId,
          profilePicture: data.profilePicture,
          isOwner: false
        } as SquadMember;
      });
      setSquadMembers(members);
    } catch (error) {
      console.warn("Could not load squad members from Firestore, using localStorage:", error);
      // Fallback to localStorage
      const storedSquad = localStorage.getItem(`squad_${userProfile.uid}`);
      if (storedSquad) {
        try {
          setSquadMembers(JSON.parse(storedSquad));
        } catch (parseError) {
          console.error("Failed to parse squad members", parseError);
          setSquadMembers([]);
        }
      }
    }
  };

  const loadLocalData = () => {
    if (!userProfile) return;

    // Get KYC documents from localStorage (if any)
    const storedKycStr = localStorage.getItem('netwin_kyc');

    if (storedKycStr) {
      try {
        const allKycDocs = JSON.parse(storedKycStr) as Record<string, KycDocument[]>;
        setKycDocuments(allKycDocs[userProfile.uid] || []);
      } catch (error) {
        console.error("Failed to parse KYC documents", error);
        setKycDocuments([]);
      }
    }

    // Get squad members from localStorage
    const storedSquad = localStorage.getItem(`squad_${userProfile.uid}`);
    if (storedSquad) {
      try {
        setSquadMembers(JSON.parse(storedSquad));
      } catch (error) {
        console.error("Failed to parse squad members", error);
        setSquadMembers([]);
      }
    }
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (userProfile && updateUserProfile) {
      try {
        await updateUserProfile(data);
        return true;
      } catch (error) {
        console.error("Error updating profile:", error);
        return false;
      }
    }
    return false;
  };

  const submitKycDocument = async (document: Omit<KycDocument, "id" | "userId" | "status" | "createdAt" | "updatedAt"> & { frontImageFile?: string, backImageFile?: string, selfieFile?: string }) => {
    if (!userProfile) return false;

    console.log("[useUser] Starting submitKycDocument...");
    try {
      // Upload images to Firebase Storage if provided
      let frontImageUrl = document.frontImageUrl || '';
      let backImageUrl = document.backImageUrl || '';
      let selfieUrl = '';
      if (document.frontImageFile) {
        const frontRef = ref(storage, `kyc/${userProfile.uid}/front_${Date.now()}`);
        await uploadString(frontRef, document.frontImageFile, 'data_url');
        frontImageUrl = await getDownloadURL(frontRef);
      }
      if (document.backImageFile) {
        const backRef = ref(storage, `kyc/${userProfile.uid}/back_${Date.now()}`);
        await uploadString(backRef, document.backImageFile, 'data_url');
        backImageUrl = await getDownloadURL(backRef);
      }
      if (document.selfieFile) {
        const selfieRef = ref(storage, `kyc/${userProfile.uid}/selfie_${Date.now()}`);
        await uploadString(selfieRef, document.selfieFile, 'data_url');
        selfieUrl = await getDownloadURL(selfieRef);
      }
      // Save to Firestore (exclude file fields)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { frontImageFile: _front, backImageFile: _back, selfieFile: _selfie, ...documentData } = document;
      const newDoc = {
        ...documentData,
        frontImageUrl,
        backImageUrl,
        selfieUrl,
        userId: userProfile.uid,
        status: "PENDING" as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await addDoc(collection(db, "kyc_documents"), newDoc);
      const savedDoc = { ...newDoc, id: docRef.id };

      // Update user KYC status if it was not submitted before or was rejected
      if (userProfile.kycStatus === "NOT_SUBMITTED" || userProfile.kycStatus === "REJECTED") {
        await updateProfile({ kycStatus: "PENDING" });

        // Ensure UI gets updated profile with new KYC status
        await refreshUserProfile();

        // Log current KYC status after refresh
      }

      // Update state
      setKycDocuments(prev => [...prev, savedDoc]);

      return true;
    } catch (error) {
      console.warn("Could not save KYC document to Firestore, using localStorage:", error);

      // Fallback to localStorage
      const newDoc: KycDocument = {
        ...document,
        id: Date.now().toString(),
        userId: userProfile.uid,
        status: "PENDING",
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const storedKycStr = localStorage.getItem('netwin_kyc');
      let allKycDocs: Record<string, KycDocument[]> = {};

      if (storedKycStr) {
        try {
          allKycDocs = JSON.parse(storedKycStr);
        } catch (error) {
          console.error("Failed to parse KYC documents", error);
        }
      }

      const userDocs = allKycDocs[userProfile.uid] || [];
      userDocs.push(newDoc);
      allKycDocs[userProfile.uid] = userDocs;

      localStorage.setItem('netwin_kyc', JSON.stringify(allKycDocs));

      // Update user KYC status if it was not submitted before or was rejected
      if (userProfile.kycStatus === "NOT_SUBMITTED" || userProfile.kycStatus === "REJECTED") {
        console.log("[submitKycDocument] Updating KYC status to PENDING (localStorage fallback)");
        await updateProfile({ kycStatus: "PENDING" });

        // Ensure UI gets updated profile with new KYC status
        await refreshUserProfile();
      }

      // Update state
      setKycDocuments(prev => [...prev, newDoc]);

      return true;
    }
  };

  const getKycStatus = () => {
    if (!userProfile) return "not_submitted";
    return userProfile.kycStatus;
  };

  const getRequiredDocuments = () => {
    if (!userProfile) return [];
    return getRequiredKycDocuments(userProfile.country);
  };

  // Update game ID
  const updateGameId = async (gameId: string) => {
    if (userProfile) {
      return await updateProfile({ gameId });
    }
    return false;
  };

  // Upload profile image
  const uploadProfileImage = async (imageData: string) => {
    if (!userProfile) return false;

    try {
      // Update user profile with new image
      await updateProfile({ photoURL: imageData });
      return true;
    } catch (error) {
      console.error("Error uploading profile image:", error);
      return false;
    }
  };
  const getSquadMembers = () => {
    return squadMembers;
  }; const addSquadMember = async (username: string, gameId: string) => {
    if (!userProfile) {
      console.error('No user profile available for adding squad member');
      return false;
    }

    try {
      const memberId = Date.now();
      const newMember: SquadMember = {
        id: memberId,
        username,
        gameId,
        profilePicture: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`,
        isOwner: false
      };

      // Try to save to Firestore first
      try {
        const docRef = await addDoc(collection(db, "squad_members"), {
          id: memberId,
          ownerId: userProfile.uid,
          username,
          gameId,
          profilePicture: newMember.profilePicture,
          createdAt: new Date()
        });
        // Update local state
        setSquadMembers(prev => [...prev, newMember]);
        return true;
      } catch (firestoreError) {
        console.warn("Could not save squad member to Firestore, using localStorage:", firestoreError);

        // Fallback to localStorage
        const currentSquad = getSquadMembers();
        const updatedSquad = [...currentSquad, newMember];
        localStorage.setItem(`squad_${userProfile.uid}`, JSON.stringify(updatedSquad));
        setSquadMembers(updatedSquad);
        return true;
      }
    } catch (error) {
      console.error("Error adding squad member:", error);
      return false;
    }
  };
  const removeSquadMember = async (memberId: number) => {
    if (!userProfile) return false;

    try {
      // Try to remove from Firestore first
      try {
        // Find the document with the matching id and ownerId
        const squadQuery = query(
          collection(db, "squad_members"),
          where("ownerId", "==", userProfile.uid),
          where("id", "==", memberId)
        );
        const squadSnapshot = await getDocs(squadQuery);

        if (!squadSnapshot.empty) {
          // Delete the first matching document
          await deleteDoc(squadSnapshot.docs[0].ref);
        }

        // Update local state
        setSquadMembers(prev => prev.filter(member => member.id !== memberId));
        return true;
      } catch (firestoreError) {
        console.warn("Could not remove squad member from Firestore, using localStorage:", firestoreError);

        // Fallback to localStorage
        const currentSquad = getSquadMembers();
        const updatedSquad = currentSquad.filter((member: SquadMember) => member.id !== memberId);
        localStorage.setItem(`squad_${userProfile.uid}`, JSON.stringify(updatedSquad));
        setSquadMembers(updatedSquad);
        return true;
      }
    } catch (error) {
      console.error("Error removing squad member:", error);
      return false;
    }
  };

  return {
    profile: userProfile,
    kycDocuments,
    loading,
    updateProfile,
    submitKycDocument,
    getKycStatus,
    getRequiredDocuments,
    updateGameId,
    uploadProfileImage,
    getSquadMembers,
    addSquadMember,
    removeSquadMember,
    squadMembers
  };
}
