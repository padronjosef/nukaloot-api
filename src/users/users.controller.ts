import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { ActorGuard, type RequestWithActor } from './actor.guard';
import { RequirePermission } from './require-permission.decorator';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto';

@Controller('users')
@UseGuards(BearerGuard, ActorGuard)
@RequirePermission('MANAGE_ACCESS')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Post()
  create(@Body() body: CreateUserDto) {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @Req() req: RequestWithActor,
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ) {
    // Locking yourself out is the one mistake this panel cannot undo.
    if (req.actor?.id === id && (body.isActive === false || body.role)) {
      throw new ForbiddenException('You cannot change your own role or status');
    }

    return this.users.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: RequestWithActor, @Param('id') id: string) {
    if (req.actor?.id === id) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    await this.users.remove(id);
  }
}
