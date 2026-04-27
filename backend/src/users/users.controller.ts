import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
  BadRequestException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./entities/user.entity";
import { SelfOrAdminGuard } from "./guards/self-or-admin.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ThrottleOverride } from "../common/decorators/throttle-override.decorator";
import {
  RouteTypeDecorator,
  RouteType,
} from "../common/decorators/throttle-override.decorator";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RouteTypeDecorator(RouteType.HIGH_RISK_WRITE)
  @ThrottleOverride("USER_CREATION") // 10 requests per minute
  @ApiOperation({ summary: "Create a new user" })
  @ApiResponse({
    status: 201,
    description: "User created successfully",
    type: User,
  })
  @ApiResponse({ status: 400, description: "Bad Request - Invalid data" })
  @ApiResponse({
    status: 409,
    description: "Conflict - Username, email, or wallet address already exists",
  })
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @RouteTypeDecorator(RouteType.AUTHENTICATED_READ)
  @ThrottleOverride("AUTHENTICATED_READ") // 400 requests per minute
  @ApiOperation({ summary: "Get all users" })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Page number (default: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Items per page (default: 20, max: 100)",
  })
  @ApiResponse({
    status: 200,
    description: "Paginated list of users",
    schema: {
      example: {
        data: [
          {
            /* user fields */
          },
        ],
        meta: {
          total: 120,
          page: 2,
          limit: 20,
          totalPages: 6,
          hasNextPage: true,
          hasPreviousPage: true,
        },
      },
    },
  })
  findAll(@Query("page") page = 1, @Query("limit") limit = 20): Promise<any> {
    return this.usersService.findAll(Number(page), Number(limit));
  }

  @Get("artists")
  @ApiOperation({ summary: "Get all artists" })
  @ApiResponse({
    status: 200,
    description: "List of all artists",
    type: [User],
  })
  findArtists(): Promise<User[]> {
    return this.usersService.findArtists();
  }

  @Get("search")
  @ApiOperation({
    summary: "Search users by username, email, or wallet address",
  })
  @ApiQuery({
    name: "username",
    description: "Search by username",
    required: false,
  })
  @ApiQuery({ name: "email", description: "Search by email", required: false })
  @ApiQuery({
    name: "wallet",
    description: "Search by wallet address",
    required: false,
  })
  @ApiResponse({ status: 200, description: "User found", type: User })
  @ApiResponse({
    status: 400,
    description: "Bad Request - No search parameter provided",
  })
  @ApiResponse({ status: 404, description: "User not found" })
  async search(
    @Query("username") username?: string,
    @Query("email") email?: string,
    @Query("wallet") wallet?: string,
  ): Promise<User> {
    if (username) {
      return this.usersService.findByUsername(username);
    }
    if (email) {
      return this.usersService.findByEmail(email);
    }
    if (wallet) {
      return this.usersService.findByWalletAddress(wallet);
    }
    throw new BadRequestException(
      "At least one search parameter (username, email, or wallet) is required",
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a user by ID" })
  @ApiParam({ name: "id", description: "User UUID", type: "string" })
  @ApiResponse({ status: 200, description: "User details", type: User })
  @ApiResponse({
    status: 400,
    description: "Bad Request - Invalid UUID format",
  })
  @ApiResponse({ status: 404, description: "User not found" })
  findOne(@Param("id", ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.findOne(id);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, SelfOrAdminGuard)
  @RouteTypeDecorator(RouteType.MODERATE_WRITE)
  @ThrottleOverride("USER_UPDATE") // 50 requests per minute
  @ApiOperation({ summary: "Update a user" })
  @ApiParam({ name: "id", description: "User UUID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "User updated successfully",
    type: User,
  })
  @ApiResponse({
    status: 400,
    description: "Bad Request - Invalid data or UUID format",
  })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Can only update your own account or need admin privileges",
  })
  @ApiResponse({
    status: 409,
    description: "Conflict - Username, email, or wallet address already exists",
  })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, SelfOrAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft delete a user (self or admin only)" })
  @ApiParam({ name: "id", description: "User UUID", type: "string" })
  @ApiResponse({ status: 204, description: "User soft-deleted successfully" })
  @ApiResponse({
    status: 400,
    description: "Bad Request - Invalid UUID format",
  })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Can only delete your own account or need admin privileges",
  })
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.usersService.remove(id);
  }

  // Admin only
  @Delete(":id/hard")
  @UseGuards(JwtAuthGuard, SelfOrAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Hard delete a user (admin only)" })
  @ApiParam({ name: "id", description: "User UUID", type: "string" })
  @ApiResponse({ status: 204, description: "User hard-deleted successfully" })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Admin privileges required",
  })
  async hardDelete(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.usersService.hardDelete(id);
  }

  // Admin only
  @Post(":id/restore")
  @UseGuards(JwtAuthGuard, SelfOrAdminGuard)
  @ApiOperation({ summary: "Restore a soft-deleted user (admin only)" })
  @ApiParam({ name: "id", description: "User UUID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "User restored successfully",
    type: User,
  })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Admin privileges required",
  })
  async restore(@Param("id", ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.restore(id);
  }
}
