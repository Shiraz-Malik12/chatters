const getDashboard = (request, response) => {
  return response.status(200).json({
    success: true,
    message: 'Dashboard access granted',
    user: request.user,
  });
};

export { getDashboard };
