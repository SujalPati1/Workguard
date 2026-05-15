import React from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";

/**
 * ProtectedRoute Component
 * 
 * This component ensures only authenticated users can access protected pages.
 * If user is not authenticated, redirects to login.
 */
export const ProtectedRoute = ({ element: Element, ...rest }) => {
  const { isAuthenticated, employee, accessToken } = useSession();

  if (!isAuthenticated || !employee || !accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <Element {...rest} />;
};

export default ProtectedRoute;
