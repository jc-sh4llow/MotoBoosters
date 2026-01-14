import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * One-time migration script to add createdAt and updatedAt fields
 * to all existing user records in Firestore.
 * 
 * For existing records without these fields:
 * - createdAt: Set to current timestamp (since we can't determine actual creation date)
 * - updatedAt: Set to current timestamp
 */
export async function migrateUserDates() {
  try {
    console.log('Starting user dates migration...');
    
    const usersCollection = collection(db, 'users');
    const snapshot = await getDocs(usersCollection);
    
    let updatedCount = 0;
    let skippedCount = 0;
    const currentTimestamp = new Date().toISOString();
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      
      // Check if the record already has both fields
      if (data.createdAt && data.updatedAt) {
        console.log(`Skipping user ${docSnap.id} - already has date fields`);
        skippedCount++;
        continue;
      }
      
      // Prepare update data
      const updateData: { createdAt?: string; updatedAt?: string } = {};
      
      if (!data.createdAt) {
        updateData.createdAt = currentTimestamp;
      }
      
      if (!data.updatedAt) {
        updateData.updatedAt = currentTimestamp;
      }
      
      // Update the document
      const userRef = doc(db, 'users', docSnap.id);
      await updateDoc(userRef, updateData);
      
      console.log(`Updated user ${docSnap.id} with date fields`);
      updatedCount++;
    }
    
    console.log('Migration completed!');
    console.log(`Updated: ${updatedCount} records`);
    console.log(`Skipped: ${skippedCount} records (already had date fields)`);
    console.log(`Total: ${snapshot.docs.length} records`);
    
    return {
      success: true,
      updated: updatedCount,
      skipped: skippedCount,
      total: snapshot.docs.length
    };
  } catch (error) {
    console.error('Migration failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
