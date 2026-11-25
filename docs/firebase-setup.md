# הקמת המאגר המשותף (פעם אחת)

1. נכנסים ל-https://console.firebase.google.com ← **Add project** ← שם: `meatzev-chacham` ← בלי Analytics.
2. בתפריט: **Build ← Firestore Database ← Create database** ← מיקום `eur3 (europe-west)` ← **Production mode**.
3. בלשונית **Rules** מדביקים ולוחצים **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /ws/{code}/{document=**} {
      allow read, write: if code.size() >= 24;
    }
  }
}
```

4. ⚙️ **Project settings** ← למטה **Your apps** ← אייקון `</>` (Web) ← שם כלשהו ← **Register app**.
   מעתיקים את `apiKey` ואת `projectId`.
5. באפליקציה: **הגדרות ← מאגר משותף ← הקמת מאגר חדש** ← מדביקים ← **יצירת מאגר משותף**.
6. **שליחת הזמנה בוואטסאפ** לשותפים.

התוכנית החינמית של Firebase (Spark) מספיקה: 1GB אחסון, בלי כרטיס אשראי.
