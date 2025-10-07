import React, { useEffect } from "react";
import AdminUtilities from "@/components/AdminUtilities";

const AdminSetup: React.FC = () => {
  useEffect(() => {
    document.title = "Admin Setup | Utilities";
  }, []);

  return <AdminUtilities />;
};

export default AdminSetup;
